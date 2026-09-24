import { PrismaClient, TaskStatus } from "@prisma/client";

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://taskforge:taskforge@127.0.0.1:5432/taskforge_test?schema=public";

describe("database — Task model contract", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
  let ownerId: string;

  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`; // fail fast if the isolated test DB is unreachable
    const owner = await prisma.user.upsert({
      where: { email: "db-suite-owner@example.com" },
      update: {},
      create: { email: "db-suite-owner@example.com", passwordHash: "not-a-real-hash" },
    });
    ownerId = owner.id;
  });

  afterAll(async () => {
    await prisma.task.deleteMany();
    await prisma.token.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("persists and retrieves a Task with all required fields", async () => {
    await prisma.task.deleteMany();

    const created = await prisma.task.create({
      data: { title: "Write integration tests", ownerId },
    });
    const found = await prisma.task.findUnique({ where: { id: created.id } });

    expect(found).not.toBeNull();
    expect(found!.title).toBe("Write integration tests");
    expect(found!.status).toBe(TaskStatus.todo); // default status
    expect(found!.description).toBeNull(); // nullable default
    expect(found!.dueDate).toBeNull(); // nullable default
    expect(found!.ownerId).toBe(ownerId); // multi-user: every task has an owner
    expect(found!.isShared).toBe(false); // default visibility: private
    expect(found!.version).toBe(1); // optimistic concurrency starts at 1
    expect(found!.createdAt).toBeInstanceOf(Date);
    expect(found!.updatedAt).toBeInstanceOf(Date);
  });

  it("stores nullable fields as null when omitted at creation", async () => {
    await prisma.task.deleteMany();
    const task = await prisma.task.create({
      data: { title: "No optional fields", ownerId },
    });

    expect(task.description).toBeNull();
    expect(task.dueDate).toBeNull();
  });

  it("persists non-null values for description, dueDate and status", async () => {
    await prisma.task.deleteMany();
    const due = new Date("2026-10-01T12:00:00.000Z");
    const task = await prisma.task.create({
      data: {
        title: "Full task",
        description: "A full description",
        status: TaskStatus.in_progress,
        dueDate: due,
        ownerId,
      },
    });

    expect(task.description).toBe("A full description");
    expect(task.status).toBe(TaskStatus.in_progress);
    expect(task.dueDate?.toISOString()).toBe(due.toISOString());
  });

  it("filters by status using the indexed column", async () => {
    await prisma.task.deleteMany();
    await prisma.task.createMany({
      data: [
        { title: "todo one", status: TaskStatus.todo, ownerId },
        { title: "in progress two", status: TaskStatus.in_progress, ownerId },
        { title: "done three", status: TaskStatus.done, ownerId },
      ],
    });

    const doneTasks = await prisma.task.findMany({ where: { status: TaskStatus.done } });
    expect(doneTasks).toHaveLength(1);
    expect(doneTasks[0].title).toBe("done three");
    expect(doneTasks[0].status).toBe(TaskStatus.done);
  });
});
