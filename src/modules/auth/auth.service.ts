import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database';
import { env } from '../../config/env.config';
import { RegisterDto, LoginDto } from './auth.dto';
import { ConflictError, UnauthorizedError, NotFoundError } from '../../common/errors/app-error';

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    name: string;
    createdAt: Date;
  };
  token: string;
}

export class AuthService {
  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existingUser = await prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictError('A user with this email address already exists');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(dto.password, salt);

    const user = await prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email.toLowerCase(),
        password: hashedPassword,
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    const token = this.generateToken(user.id, user.email, user.name);

    return { user, token };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const token = this.generateToken(user.id, user.email, user.name);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
      },
      token,
    };
  }

  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        wallets: {
          select: {
            id: true,
            balance: true,
            currency: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return user;
  }

  private generateToken(id: string, email: string, name: string): string {
    return jwt.sign({ id, email, name }, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });
  }
}

export const authService = new AuthService();
