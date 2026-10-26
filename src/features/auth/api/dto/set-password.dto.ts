import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SetPasswordDto {
  /**
   * Нужен только при смене существующего пароля. Для создания пароля на
   * SSO-аккаунте поле не передаётся.
   */
  @IsOptional()
  @IsString({ message: 'Текущий пароль должен быть строкой' })
  @MaxLength(128, { message: 'Текущий пароль не должен быть длиннее 128 символов' })
  currentPassword?: string;

  @IsString({ message: 'Пароль должен быть строкой' })
  @MinLength(8, { message: 'Пароль должен быть не менее 8 символов' })
  @MaxLength(128, { message: 'Пароль должен быть не длиннее 128 символов' })
  password: string;
}
