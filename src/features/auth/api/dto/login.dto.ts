import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Укажите корректный email' })
  @MaxLength(255, { message: 'Email должен быть не длиннее 255 символов' })
  email: string;

  @IsString({ message: 'Пароль должен быть строкой' })
  @MinLength(1, { message: 'Введите пароль' })
  @MaxLength(128, { message: 'Пароль должен быть не длиннее 128 символов' })
  password: string;
}
