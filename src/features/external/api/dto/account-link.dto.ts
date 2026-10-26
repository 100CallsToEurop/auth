import { IsString, MaxLength, MinLength } from 'class-validator';

/** Одноразовый токен заявки на привязку SSO. */
export class AccountLinkTokenDto {
  @IsString()
  @MinLength(20)
  @MaxLength(256)
  token: string;
}

/** Подтверждение владения аккаунтом паролем. */
export class ConfirmAccountLinkDto extends AccountLinkTokenDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}
