import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength } from 'class-validator';

export class ConfirmPhoneDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Номер телефона должен быть строкой' })
  @MaxLength(32, { message: 'Номер телефона слишком длинный' })
  @Matches(/^\+?[\d\s()-]{10,32}$/, {
    message: 'Введите корректный номер телефона',
  })
  phone: string;
}
