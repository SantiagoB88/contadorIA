import { Injectable } from '@nestjs/common';
import type { PasswordResetToken } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export interface CreatePasswordResetTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

@Injectable()
export class PasswordResetTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreatePasswordResetTokenInput): Promise<PasswordResetToken> {
    return this.prisma.passwordResetToken.create({ data: input });
  }

  findByHash(tokenHash: string): Promise<PasswordResetToken | null> {
    return this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  }

  async markUsed(id: string): Promise<void> {
    await this.prisma.passwordResetToken.update({ where: { id }, data: { usedAt: new Date() } });
  }
}
