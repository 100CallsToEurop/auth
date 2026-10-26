import { IsString, MaxLength, MinLength } from 'class-validator';

export class SetPasswordDto {
  @IsString({ message: 'Пароль должен быть строкой' })
  @MinLength(8, { message: 'Пароль должен быть не менее 8 символов' })
  @MaxLength(128, { message: 'Пароль должен быть не длиннее 128 символов' })
  password: string;
}
