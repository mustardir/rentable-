import { Injectable } from '@nestjs/common';
import { EntryStatus, Prisma } from '@prisma/client';
import type { JournalEntry, JournalLine, Repository } from '@fortress/ledger-core';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTransaction = Prisma.TransactionClient;
type JournalEntryWithLines = Prisma.JournalEntryGetPayload<{ include: { lines: true } }>;

@Injectable()
export class PrismaLedgerRepository implements Repository {
  constructor(private readonly prisma: PrismaService) {}

  async saveEntry(entry: JournalEntry, tx: PrismaTransaction | PrismaService = this.prisma): Promise<JournalEntry> {
    try {
      await tx.journalEntry.create({
        data: {
          id: entry.id,
          idempotencyKey: entry.idempotencyKey,
          reference: entry.idempotencyKey,
          description: `Journal entry ${entry.idempotencyKey}`,
          currency: 'NGN',
          status: entry.status as EntryStatus,
          postedAt: entry.postedAt,
          reversalOfId: entry.reversalOfId,
          reversedById: entry.reversedById,
          createdAt: entry.createdAt,
          lines: {
            create: entry.lines.map((line) => ({
              id: line.id,
              accountId: line.accountId,
              direction: line.direction,
              amountKobo: line.amountKobo,
              metadata: line.metadata as Prisma.InputJsonValue,
              createdAt: line.createdAt,
            })),
          },
        },
      });

      return entry;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await tx.journalEntry.findUnique({
          where: { idempotencyKey: entry.idempotencyKey },
          include: { lines: true },
        });
        if (existing) return this.toDomain(existing);
      }
      throw error;
    }
  }

  async findEntryById(id: string): Promise<JournalEntry | undefined> {
    const entry = await this.prisma.journalEntry.findUnique({ where: { id }, include: { lines: true } });
    return entry ? this.toDomain(entry) : undefined;
  }

  async findEntryByIdempotencyKey(key: string): Promise<JournalEntry | undefined> {
    const entry = await this.prisma.journalEntry.findUnique({ where: { idempotencyKey: key }, include: { lines: true } });
    return entry ? this.toDomain(entry) : undefined;
  }

  async findAllEntries(): Promise<readonly JournalEntry[]> {
    const entries = await this.prisma.journalEntry.findMany({ orderBy: { createdAt: 'asc' }, include: { lines: true } });
    return entries.map((entry) => this.toDomain(entry));
  }

  async saveReversal(originalEntryId: string, reversal: JournalEntry): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.journalEntry.updateMany({
        where: { id: originalEntryId, status: EntryStatus.POSTED, reversedById: null },
        data: { reversedById: reversal.id },
      });

      if (claimed.count !== 1) {
        const current = await tx.journalEntry.findUnique({ where: { id: originalEntryId } });
        if (!current) throw new Error(`ENTRY_NOT_FOUND:${originalEntryId}`);
        if (current.status !== EntryStatus.POSTED) throw new Error(`NOT_POSTED:${originalEntryId}`);
        throw new Error(`ALREADY_REVERSED:${originalEntryId}`);
      }

      await this.saveEntry(reversal, tx);
    });
  }

  private toDomain(entry: JournalEntryWithLines): JournalEntry {
    const lines: JournalLine[] = entry.lines.map((line) => Object.freeze({
      id: line.id,
      journalEntryId: line.journalEntryId,
      accountId: line.accountId,
      direction: line.direction,
      amountKobo: line.amountKobo as JournalLine['amountKobo'],
      metadata: Object.freeze(this.stringMetadata(line.metadata)),
      createdAt: line.createdAt,
    }));

    return Object.freeze({
      id: entry.id,
      idempotencyKey: entry.idempotencyKey,
      status: entry.status === EntryStatus.DRAFT ? 'PENDING' : entry.status,
      lines: Object.freeze(lines),
      postedAt: entry.postedAt,
      reversalOfId: entry.reversalOfId ?? undefined,
      reversedById: entry.reversedById ?? undefined,
      createdAt: entry.createdAt,
    });
  }

  private stringMetadata(metadata: Prisma.JsonValue): Readonly<Record<string, string>> {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
    return Object.fromEntries(Object.entries(metadata).map(([key, value]) => [key, String(value)]));
  }
}
