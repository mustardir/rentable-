import { Body, Controller, Post } from '@nestjs/common';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { TransfersService } from './transfers.service';

@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Post()
  create(@Body() dto: CreateTransferDto) {
    return this.transfersService.createTransfer(dto);
  }
}
