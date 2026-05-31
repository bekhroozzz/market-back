import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SignUpDto } from './dto/signup-auth.dto';
import * as bcrypt from 'bcrypt';
import { SignInDto } from './dto/signin-auth.dto';
import { Role } from '../user/enums/role.enum';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { EmailVerification } from './entities/email-verification.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(EmailVerification)
    private readonly verificationRepo: Repository<EmailVerification>,
  ) {}

  async signUp(signUpDto: SignUpDto): Promise<{
    accessToken: string;
    refreshToken: string;
    message: string;
  }> {
    const userExists = await this.userService.findOneByEmail(signUpDto.email);

    if (userExists) {
      throw new ConflictException(
        'Пользователь с таким email уже зарегистрирован',
      );
    }

    const userData = {
      ...signUpDto,
      role: signUpDto.role || Role.User,
      emailVerified: false,
    };

    const user = await this.userService.create(userData);

    // await this.sendVerificationEmail(user.email, user.id);

    const tokens = await this.getTokens(user.id, user.email, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      ...tokens,
      message:
        'Вы успешно зарегистрировались. Пожалуйста подтвердите свой email',
    };
  }

  async signIn(
    signInDto: SignInDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.userService.findOneByEmail(signInDto.email);

    if (!user) {
      throw new UnauthorizedException('Неправильный логин или пароль');
    }

    // if (!user.emailVerified) {
    //   throw new BadRequestException(
    //     'Пожалуйста подтвердите свою почту для входа',
    //   );
    // }

    const isPasswordMatching = await bcrypt.compare(
      signInDto.password,
      user.password,
    );

    if (!isPasswordMatching) {
      throw new UnauthorizedException('Неправильный логин или пароль');
    }

    const tokens = await this.getTokens(user.id, user.email, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);
    return tokens;
  }

  // private async sendVerificationEmail(email: string, userId: number) {
  //   const token = crypto.randomBytes(32).toString('hex');
  //
  //   const user = await this.userService.findOneById(userId);
  //   if (!user) throw new Error('User not found');
  //
  //   const verification = this.verificationRepo.create({ token, user });
  //   await this.verificationRepo.save(verification);
  //
  //   const verifyUrl = `${this.configService.get(
  //     'FRONTEND_URL',
  //   )}/verify-email?token=${token}`;
  //
  //   try {
  //     const mailgun = new Mailgun(FormData);
  //     const mg = mailgun.client({
  //       username: 'api',
  //       key: this.configService.get<string>('EMAIL_SERVER_API_KEY'),
  //     });
  //
  //     await mg.messages.create(this.configService.get<string>('EMAIL_DOMAIN'), {
  //       from: 'Mailgun Sandbox <postmaster@sandboxf823e77d7e3849e3b7ebe1bd1fe5edef.mailgun.org>',
  //       to: [email],
  //       subject: 'Привет, подтверди почту',
  //       template: 'Подтвердить почту',
  //       'h:X-Mailgun-Variables': JSON.stringify({
  //         EMAIL_VERIFICATION: verifyUrl,
  //       }),
  //     });
  //   } catch (error) {
  //     console.log(error);
  //   }
  // }

  // async verifyEmailToken(token: string): Promise<{ message: string }> {
  //   const verification = await this.verificationRepo.findOne({
  //     where: { token },
  //     relations: ['user'],
  //   });
  //
  //   if (!verification) {
  //     throw new BadRequestException('Invalid or expired token');
  //   }
  //
  //   const user = verification.user;
  //
  //   if (user.emailVerified) {
  //     throw new BadRequestException('Email already verified');
  //   }
  //
  //   user.emailVerified = true;
  //   await this.userService.update(user.id, { emailVerified: true });
  //   await this.verificationRepo.delete({ token });
  //
  //   return { message: 'Email verified successfully' };
  // }

  // async resendVerificationEmail(email: string): Promise<{ message: string }> {
  //   const user = await this.userService.findOneByEmail(email);
  //
  //   if (!user) {
  //     throw new BadRequestException('User not found');
  //   }
  //
  //   if (user.emailVerified) {
  //     throw new BadRequestException('Email already verified');
  //   }
  //
  //   await this.sendVerificationEmail(user.email, user.id);
  //
  //   return { message: 'Verification email sent successfully' };
  // }

  async logout(userId: number): Promise<void> {
    await this.updateRefreshToken(userId, null);
  }

  async refreshTokens(
    userId: number,
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.userService.findOneById(userId);
    if (!user || !user.refreshToken)
      throw new UnauthorizedException('Access Denied');

    const refreshTokenMatches = await bcrypt.compare(
      refreshToken,
      user.refreshToken,
    );
    if (!refreshTokenMatches) throw new UnauthorizedException('Access Denied');

    const tokens = await this.getTokens(user.id, user.email, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);
    return tokens;
  }

  async updateRefreshToken(userId: number, refreshToken: string | null) {
    const hashedRefreshToken = refreshToken
      ? await bcrypt.hash(refreshToken, 10)
      : null;
    await this.userService.update(userId, {
      refreshToken: hashedRefreshToken,
    });
  }

  private async getTokens(
    userId: number,
    email: string,
    role: Role,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    refreshTokenExpire: number;
  }> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        {
          sub: userId,
          email,
          role,
        },
        {
          secret: this.configService.get<string>('JWT_SECRET'),
          expiresIn: '15m',
        },
      ),
      this.jwtService.signAsync(
        {
          sub: userId,
          email,
          role,
        },
        {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
          expiresIn: '7d',
        },
      ),
    ]);

    const decoded = this.jwtService.decode(refreshToken) as { exp: number };

    return {
      accessToken,
      refreshToken,
      refreshTokenExpire: decoded.exp,
    };
  }
}
