import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InvestorService } from './investor.service';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; role: string };
}

@Controller('investor')
@UseGuards(JwtAuthGuard)
export class InvestorController {
  constructor(private readonly investorService: InvestorService) {}

  @Get('profile')
  profile(@Req() req: AuthenticatedRequest) {
    return this.investorService.getProfileForUser(req.user.id);
  }
}
