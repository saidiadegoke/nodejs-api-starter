import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../utils/guards/jwt-auth.guard';
import { CurrentUser } from '../../../utils/decorators/current-user.decorator';
import { FinanceService } from '../services/finance.service';
import {
  CreateCheckoutDto,
  CreateInstitutionCheckoutDto,
  ReconcilePaymentDto,
  ListMyPaymentsQueryDto,
  ListAdminPaymentsQueryDto,
  ListInstitutionPaymentsQueryDto,
  AnalyticsQueryDto,
  CheckoutResponseDto,
  PaymentReceiptResponseDto,
  FeePreviewResponseDto,
  InstitutionFinanceOverviewResponseDto,
  PaymentTrendsResponseDto,
  FoundationFinanceOverviewResponseDto,
  PaymentMethodDto,
} from '../dto';

@ApiTags('Finance & Payments')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('payment-methods')
  @ApiOperation({
    summary: 'List available payment methods',
    description: 'Retrieves active payment gateways and payment methods available for checkout.',
  })
  @ApiOkResponse({ type: [PaymentMethodDto] })
  async listPaymentMethods() {
    return this.financeService.listPaymentMethods();
  }

  @Get('me/fee-preview')
  @ApiOperation({
    summary: 'Candidate fee and balance preview',
    description: 'Calculates active session fees, amount paid, and outstanding balance for candidate.',
  })
  @ApiQuery({ name: 'registration_id', required: false, type: String })
  @ApiOkResponse({ type: FeePreviewResponseDto })
  async feePreview(
    @CurrentUser('user_id') userId: string,
    @Query('registration_id') registrationId?: string,
  ) {
    return this.financeService.getFeePreview(userId, { registration_id: registrationId });
  }

  @Post('me/checkout')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create candidate checkout payment intent',
    description: 'Initializes a transaction reference and returns checkout gateway URL.',
  })
  @ApiCreatedResponse({ type: CheckoutResponseDto })
  async createCheckout(
    @CurrentUser('user_id') userId: string,
    @Body() body: CreateCheckoutDto,
  ) {
    return this.financeService.createCheckout(userId, body);
  }

  @Get('me/payments')
  @ApiOperation({
    summary: 'List candidate payment history',
    description: 'Paginated list of all payment transactions for current student.',
  })
  @ApiOkResponse({ description: 'Paginated payments' })
  async listMyPayments(
    @CurrentUser('user_id') userId: string,
    @Query() query: ListMyPaymentsQueryDto,
  ) {
    return this.financeService.listMyPayments(userId, query);
  }

  @Get('me/payments/:paymentId/receipt')
  @ApiOperation({
    summary: 'Get transaction receipt',
    description: 'Retrieves payment receipt and confirmation details.',
  })
  @ApiParam({ name: 'paymentId', type: String })
  @ApiOkResponse({ type: PaymentReceiptResponseDto })
  async paymentReceipt(
    @CurrentUser('user_id') userId: string,
    @Param('paymentId') paymentId: string,
  ) {
    return this.financeService.getPaymentReceipt(paymentId, userId);
  }

  @Get('institution/overview')
  @ApiOperation({
    summary: 'Institution fee overview',
    description: 'Aggregates projected candidate fees, collected payments, and outstanding balance for university.',
  })
  @ApiOkResponse({ type: InstitutionFinanceOverviewResponseDto })
  async institutionOverview(
    @CurrentUser('user_id') userId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.financeService.institutionOverview(query, userId);
  }

  @Get('institution/fees')
  @ApiOperation({
    summary: 'Institution fee summary',
    description: 'Returns university fee breakdown.',
  })
  @ApiOkResponse({ type: InstitutionFinanceOverviewResponseDto })
  async institutionFees(
    @CurrentUser('user_id') userId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.financeService.institutionFees(query, userId);
  }

  @Get('institution/fee-preview')
  @ApiOperation({
    summary: 'Institution fee preview',
    description: 'Calculates expected institution balance.',
  })
  @ApiOkResponse({ type: InstitutionFinanceOverviewResponseDto })
  async institutionFeePreview(
    @CurrentUser('user_id') userId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.financeService.institutionFeePreview(query, userId);
  }

  @Post('institution/checkout')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create institution bulk checkout intent',
    description: 'Generates bank transfer instructions and invoice reference for institution payment.',
  })
  @ApiCreatedResponse({ type: CheckoutResponseDto })
  async institutionCheckout(
    @CurrentUser('user_id') userId: string,
    @Body() body: CreateInstitutionCheckoutDto,
  ) {
    return this.financeService.createInstitutionCheckout(userId, body);
  }

  @Post('institution/payments/:paymentId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel pending institution payment',
    description: 'Marks pending payment attempt as cancelled.',
  })
  @ApiParam({ name: 'paymentId', type: String })
  @ApiOkResponse({ description: 'Payment marked cancelled' })
  async cancelInstitutionPayment(
    @CurrentUser('user_id') userId: string,
    @Param('paymentId') paymentId: string,
  ) {
    return this.financeService.cancelInstitutionPayment(paymentId, userId);
  }

  @Get('institution/payments')
  @ApiOperation({
    summary: 'List institution payment transactions',
    description: 'Retrieves all fee payment transactions made by the university.',
  })
  @ApiOkResponse({ description: 'Paginated payments' })
  async listInstitutionPayments(
    @CurrentUser('user_id') userId: string,
    @Query() query: ListInstitutionPaymentsQueryDto,
  ) {
    return this.financeService.listInstitutionPayments(query, userId);
  }

  @Get('institution/payments/:paymentId/receipt')
  @ApiOperation({
    summary: 'Get institution transaction receipt',
    description: 'Retrieves receipt for university fee payment.',
  })
  @ApiParam({ name: 'paymentId', type: String })
  @ApiOkResponse({ type: PaymentReceiptResponseDto })
  async institutionPaymentReceipt(
    @CurrentUser('user_id') userId: string,
    @Param('paymentId') paymentId: string,
  ) {
    return this.financeService.getInstitutionPaymentReceipt(paymentId, userId);
  }

  @Get('payments')
  @ApiOperation({
    summary: 'Admin: list all payments across platform',
    description: 'Global search and filter across all student and institution payments.',
  })
  @ApiOkResponse({ description: 'Paginated payments' })
  async listAdminPayments(
    @CurrentUser('user_id') userId: string,
    @Query() query: ListAdminPaymentsQueryDto,
  ) {
    return this.financeService.listAdminPayments(query, userId);
  }

  @Get('overview')
  @ApiOperation({
    summary: 'Foundation finance overview cards',
    description: 'Central JUPEB global financial metrics across all participating universities.',
  })
  @ApiOkResponse({ type: FoundationFinanceOverviewResponseDto })
  async foundationOverview(
    @CurrentUser('user_id') userId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.financeService.foundationOverview(query, userId);
  }

  @Get('fees')
  @ApiOperation({
    summary: 'Foundation institution fee records table',
    description: 'Aggregates collected vs projected revenue per institution.',
  })
  @ApiOkResponse({ description: 'Paginated institution fee records' })
  async foundationInstitutionFees(
    @CurrentUser('user_id') userId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.financeService.foundationInstitutionFees(query, userId);
  }

  @Get('registrations/:registrationId/payment-summary')
  @ApiOperation({
    summary: 'Registration payment summary with reconciliations',
    description: 'Detailed financial ledger for candidate registration.',
  })
  @ApiParam({ name: 'registrationId', type: String })
  @ApiOkResponse({ description: 'Registration financial summary' })
  async paymentSummary(
    @CurrentUser('user_id') userId: string,
    @Param('registrationId') registrationId: string,
  ) {
    return this.financeService.getPaymentSummary(registrationId, userId);
  }

  @Post('registrations/:registrationId/reconcile')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Manual payment reconciliation',
    description: 'Admin records manual bank teller or offline payment reconciliation.',
  })
  @ApiParam({ name: 'registrationId', type: String })
  @ApiCreatedResponse({ description: 'Reconciliation created' })
  async reconcile(
    @CurrentUser('user_id') userId: string,
    @Param('registrationId') registrationId: string,
    @Body() body: ReconcilePaymentDto,
  ) {
    return this.financeService.reconcile(registrationId, body, userId);
  }

  @Get('reports/session/:sessionId')
  @ApiOperation({
    summary: 'Session financial audit report',
    description: 'Revenue totals and transaction counts for specified academic session.',
  })
  @ApiParam({ name: 'sessionId', type: String })
  @ApiOkResponse({ description: 'Session finance audit report' })
  async sessionReport(
    @CurrentUser('user_id') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.financeService.sessionReport(sessionId, userId);
  }

  @Get('analytics/exam-fee-by-institution')
  @ApiOperation({
    summary: 'Analytics: projected exam fee per institution',
    description: 'Bar chart data of expected exam fee collection across universities.',
  })
  @ApiOkResponse({ description: 'Institution exam fee projection list' })
  async examFeeByInstitution(
    @CurrentUser('user_id') userId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.financeService.examFeeByInstitution(query, userId);
  }

  @Get('analytics/payment-trends')
  @ApiOperation({
    summary: 'Analytics: daily collected payment trends',
    description: 'Line chart time-series data of payment volume and revenue over 30 days.',
  })
  @ApiOkResponse({ type: PaymentTrendsResponseDto })
  async paymentTrends(
    @CurrentUser('user_id') userId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.financeService.paymentTrends(query, userId);
  }

  @Get('analytics/institution-fee-records')
  @ApiOperation({
    summary: 'Analytics: institution fee records',
    description: 'Table of institutions with projected vs collected payments.',
  })
  @ApiOkResponse({ description: 'Paginated fee records' })
  async institutionFeeRecords(
    @CurrentUser('user_id') userId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.financeService.institutionFeeRecords(query, userId);
  }

  @Get('analytics/institutions/:universityId/fees')
  @ApiOperation({
    summary: 'Analytics: single institution fee metrics',
    description: 'Revenue summary for specific university.',
  })
  @ApiParam({ name: 'universityId', type: String })
  @ApiOkResponse({ description: 'Institution fee metrics' })
  async foundationInstitutionFeesByUniversity(
    @CurrentUser('user_id') userId: string,
    @Param('universityId') universityId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.financeService.foundationInstitutionFeesByUniversity(
      universityId,
      query,
      userId,
    );
  }

  @Get('analytics/institutions/:universityId/payments')
  @ApiOperation({
    summary: 'Analytics: list payments for specific institution',
    description: 'Paginated payments filtered for a specific university.',
  })
  @ApiParam({ name: 'universityId', type: String })
  @ApiOkResponse({ description: 'Paginated payments' })
  async listFoundationInstitutionPayments(
    @CurrentUser('user_id') userId: string,
    @Param('universityId') universityId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.financeService.listFoundationInstitutionPayments(
      universityId,
      query,
      userId,
    );
  }
}
