import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PaymentMethodDto {
  @ApiProperty({ example: 'b1c2d3e4-f5a6-7890-1234-56789abcdef0' })
  id: string;

  @ApiProperty({ example: 'paystack' })
  code: string;

  @ApiProperty({ example: 'Paystack' })
  name: string;

  @ApiProperty({ example: 'online' })
  type: string;

  @ApiPropertyOptional({ example: 'Pay with Card or USSD' })
  description?: string;
}

export class CheckoutResponseDto {
  @ApiProperty({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  id: string;

  @ApiProperty({ example: 'PAY-12345678' })
  payment_id: string;

  @ApiProperty({ example: 25000 })
  amount: number;

  @ApiProperty({ example: 'NGN' })
  currency: string;

  @ApiProperty({ example: 'pending' })
  status: string;

  @ApiPropertyOptional({ example: 'TXN-REF-123456' })
  transaction_ref?: string;

  @ApiPropertyOptional({ example: 'https://checkout.paystack.com/...' })
  checkout_url?: string;

  @ApiPropertyOptional({ example: '0123456789' })
  account_number?: string;

  @ApiPropertyOptional({ example: 'Wema Bank' })
  bank_name?: string;
}

export class PaymentReceiptResponseDto {
  @ApiProperty({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  id: string;

  @ApiProperty({ example: 'PAY-12345678' })
  payment_id: string;

  @ApiProperty({ example: 25000 })
  amount: number;

  @ApiProperty({ example: 'NGN' })
  currency: string;

  @ApiProperty({ example: 'successful' })
  status: string;

  @ApiPropertyOptional({ example: 'TXN-REF-123456' })
  transaction_ref?: string;

  @ApiPropertyOptional({ example: '2026-09-29T12:00:00.000Z' })
  paid_at?: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  payer_name?: string;

  @ApiPropertyOptional({ example: 'john@example.com' })
  payer_email?: string;
}

export class FeePreviewResponseDto {
  @ApiProperty({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  registration_id: string;

  @ApiProperty({ example: 25000 })
  total_fee: number;

  @ApiProperty({ example: 0 })
  amount_paid: number;

  @ApiProperty({ example: 25000 })
  balance_due: number;

  @ApiProperty({ example: 'NGN' })
  currency: string;

  @ApiProperty({ example: 'unpaid' })
  payment_projection: string;
}

export class InstitutionFinanceOverviewResponseDto {
  @ApiProperty({ example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d' })
  university_id: string;

  @ApiProperty({ example: 500000 })
  total_projected: number;

  @ApiProperty({ example: 250000 })
  total_collected: number;

  @ApiProperty({ example: 250000 })
  outstanding_balance: number;

  @ApiProperty({ example: 20 })
  candidates_count: number;
}

export class PaymentTrendsPointDto {
  @ApiProperty({ example: '2026-09-01' })
  date: string;

  @ApiProperty({ example: 150000 })
  total_amount: number;

  @ApiProperty({ example: 6 })
  transaction_count: number;
}

export class PaymentTrendsResponseDto {
  @ApiProperty({ type: [PaymentTrendsPointDto] })
  trends: PaymentTrendsPointDto[];
}

export class InstitutionFeeRecordItemDto {
  @ApiProperty({ example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d' })
  university_id: string;

  @ApiProperty({ example: 'UNILAG' })
  university_code: string;

  @ApiProperty({ example: 'University of Lagos' })
  university_name: string;

  @ApiProperty({ example: 500000 })
  projected_amount: number;

  @ApiProperty({ example: 500000 })
  collected_amount: number;

  @ApiProperty({ example: 'fully_paid' })
  status: string;
}

export class FoundationFinanceOverviewResponseDto {
  @ApiProperty({ example: 15000000 })
  total_projected: number;

  @ApiProperty({ example: 12500000 })
  total_collected: number;

  @ApiProperty({ example: 2500000 })
  outstanding_balance: number;

  @ApiProperty({ example: 45 })
  participating_institutions_count: number;
}
