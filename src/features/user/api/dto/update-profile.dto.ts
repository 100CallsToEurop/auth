import { IsOptional, IsString, MaxLength } from 'class-validator';

const MESSAGE = 'Поле должно быть строкой не длиннее 255 символов';

export class UpdateProfileDto {
  @IsOptional()
  @IsString({ message: MESSAGE })
  @MaxLength(255, { message: MESSAGE })
  firstName?: string | null;

  @IsOptional()
  @IsString({ message: MESSAGE })
  @MaxLength(255, { message: MESSAGE })
  lastName?: string | null;

  @IsOptional()
  @IsString({ message: MESSAGE })
  @MaxLength(255, { message: MESSAGE })
  middleName?: string | null;

  @IsOptional()
  @IsString({ message: MESSAGE })
  @MaxLength(255, { message: MESSAGE })
  organization?: string | null;

  @IsOptional()
  @IsString({ message: MESSAGE })
  @MaxLength(255, { message: MESSAGE })
  position?: string | null;
}
