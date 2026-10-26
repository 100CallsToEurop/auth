import { IsString, MaxLength, MinLength } from 'class-validator';

/** Одноразовый токен заявки на привязку SSO. */
export class AccountLinkTokenDto {
  @IsString({ message: 'Токен должен быть строкой' })
  @MinLength(20, { message: 'Токен слишком короткий' })
  @MaxLength(256, { message: 'Токен слишком длинный' })
  token: string;
}

/** Подтверждение владения аккаунтом паролем. */
export class ConfirmAccountLinkDto extends AccountLinkTokenDto {
  @IsString({ message: 'Пароль должен быть строкой' })
  @MinLength(1, { message: 'Введите пароль' })
  @MaxLength(128, { message: 'Пароль должен быть не длиннее 128 символов' })
  password: string;
}
