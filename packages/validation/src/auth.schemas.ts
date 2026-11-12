import { z } from 'zod';

export const RegisterSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().min(7).max(20).optional(),
  password: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .max(100)
    .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
    .regex(/[0-9]/, 'Debe contener al menos un número')
    .refine(value => new TextEncoder().encode(value).length <= 72, 'La contraseña no puede superar 72 bytes'),
});

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(100).refine(value => new TextEncoder().encode(value).length <= 72),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1).max(256),
});

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z
      .string()
      .min(8)
      .max(100)
      .regex(/[A-Z]/)
      .regex(/[0-9]/)
      .refine(value => new TextEncoder().encode(value).length <= 72),
    confirmPassword: z.string().min(1),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

export type RegisterDto = z.infer<typeof RegisterSchema>;
export type LoginDto = z.infer<typeof LoginSchema>;
export type RefreshTokenDto = z.infer<typeof RefreshTokenSchema>;
export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>;

export const AccountEmailSchema = RegisterSchema.pick({ email: true });
export const AccountTokenSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) });
export const ResetPasswordSchema = AccountTokenSchema.extend({
  password: RegisterSchema.shape.password,
  confirmPassword: z.string(),
}).refine(value => value.password === value.confirmPassword, {
  message: 'Las contraseñas no coinciden', path: ['confirmPassword'],
});
export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;
