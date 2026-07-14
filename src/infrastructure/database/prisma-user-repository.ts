import { EmailAlreadyExistsError } from '../../application/auth/errors.js';
import type { UserPersistence, UserRepository } from '../../application/auth/ports.js';
import type { CreateUserInput, UserRecord } from '../../application/auth/types.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaClient, User as PrismaUser } from '../../generated/prisma/client.js';

type UserClient = Pick<PrismaClient, 'user'>;

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly client: PrismaClient) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    return new PrismaUserPersistence(this.client).findByEmail(email);
  }

  async findById(id: string): Promise<UserRecord | null> {
    return new PrismaUserPersistence(this.client).findById(id);
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    return new PrismaUserPersistence(this.client).create(input);
  }

  async withTransaction<Result>(
    operation: (repository: UserPersistence) => Promise<Result>,
  ): Promise<Result> {
    return this.client.$transaction(async (transaction) => {
      return operation(new PrismaUserPersistence(transaction));
    });
  }
}

class PrismaUserPersistence implements UserPersistence {
  constructor(private readonly client: UserClient) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const user = await this.client.user.findUnique({ where: { email } });
    return user === null ? null : mapUser(user);
  }

  async findById(id: string): Promise<UserRecord | null> {
    const user = await this.client.user.findUnique({ where: { id } });
    return user === null ? null : mapUser(user);
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    try {
      const user = await this.client.user.create({ data: input });
      return mapUser(user);
    } catch (cause) {
      if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002') {
        throw new EmailAlreadyExistsError();
      }

      throw cause;
    }
  }
}

function mapUser(user: PrismaUser): UserRecord {
  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
