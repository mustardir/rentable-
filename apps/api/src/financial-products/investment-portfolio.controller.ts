import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InvestmentPortfolioService } from './investment-portfolio.service';

interface AuthenticatedRequest {
  user: { id: string };
}

@Controller('investor/portfolio')
@UseGuards(JwtAuthGuard)
export class InvestmentPortfolioController {
  constructor(private readonly service: InvestmentPortfolioService) {}

  @Get('positions')
  getMyPositions(
    @Req() req: AuthenticatedRequest,
    @Query('currency') currency?: string,
  ) {
    return this.service.getMyPositions(req.user.id, currency ?? '');
  }
}
