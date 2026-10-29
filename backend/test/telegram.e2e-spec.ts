import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { AppConfigService } from '../src/config/app-config.service.js';
import { TelegramApi } from '../src/modules/telegram/telegram-api.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

const RUN = Date.now().toString(36);
const SECRET = 'test-webhook-secret-123456';

type Sent = { method: string; chatId: string; text: string; markup?: unknown };

describe('Telegram bot (e2e)', () => {
  let app: NestExpressApplication;
  let http: App;
  let prisma: PrismaService;
  const sent: Sent[] = [];
  const fake = {
    enabled: true,
    call: () => Promise.resolve(null),
    answerCallback: () => Promise.resolve(null),
    sendMessage: (chatId: bigint | number, text: string, markup?: unknown) => {
      sent.push({ method: 'sendMessage', chatId: String(chatId), text, markup });
      return Promise.resolve(null);
    },
    sendPhoto: (
      chatId: bigint | number,
      _photo: Buffer,
      _name: string,
      caption: string,
      markup?: unknown,
    ) => {
      sent.push({ method: 'sendPhoto', chatId: String(chatId), text: caption, markup });
      return Promise.resolve(null);
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TelegramApi)
      .useValue(fake)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    setupApp(app);
    // Turn the bot on for this suite only.
    Object.defineProperty(app.get(AppConfigService), 'telegram', {
      get: () => ({ token: '123:test', webhookSecret: SECRET, polling: false, publicUrl: null }),
    });
    await app.init();
    http = app.getHttpServer() as App;
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  let updateId = 1;
  const post = (body: object, secret = SECRET) =>
    request(http)
      .post('/api/v1/telegram/webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', secret)
      .send({ update_id: updateId++, ...body });
  const userId = 700_000_000 + Math.floor(Math.random() * 1e6);
  const chat = { id: userId, type: 'private' };
  const from = { id: userId, first_name: 'Test' };
  const say = (text: string) => post({ message: { message_id: 1, chat, from, text } }).expect(200);
  const share = (phone: string, contactUser = userId) =>
    post({
      message: {
        message_id: 1,
        chat,
        from,
        contact: { phone_number: phone, user_id: contactUser },
      },
    }).expect(200);
  const last = () => sent[sent.length - 1]!;

  it('lets in only chats that share their own registered number, read-only', async () => {
    // Two siblings registered with the same (parent's) phone.
    const phone = `09${String(Date.now()).slice(-8)}`;
    const make = (firstName: string) =>
      prisma.member.create({
        data: {
          memberCode: `TG-${RUN}-${firstName}`.slice(0, 20),
          firstName,
          fatherName: 'Bot',
          grandfatherName: `G${RUN}`,
          gender: 'MALE',
          dateOfBirth: new Date('2012-01-01'),
          joinedAt: new Date('2024-01-01'),
          phone,
        },
      });
    const abel = await make('Abel');
    const bethel = await make('Bethel');

    // Without the webhook secret Telegram updates are refused.
    await post(
      { message: { message_id: 1, chat, from, text: '/start' } },
      'wrong-secret-0000000000',
    ).expect(404);

    // A stranger gets the welcome with the share-number button.
    await say('/start');
    expect(last().text).toContain('ፍቁረ እግዚእ ሰንበት ትምህርት ቤት');
    expect(JSON.stringify(last().markup)).toContain('request_contact');

    // Someone else's contact card proves nothing.
    await share(`+251${phone.slice(1)}`, userId + 1);
    expect(last().text).toContain('የራስዎን ቁጥር');
    expect(await prisma.telegramLink.count({ where: { chatId: BigInt(userId) } })).toBe(0);

    // An unregistered number is turned away.
    await share('+251900000001');
    expect(last().text).toContain('❌');
    expect(await prisma.telegramLink.count({ where: { chatId: BigInt(userId) } })).toBe(0);

    // The registered number (Telegram sends it as 2519…): pick which sibling.
    await share(`251${phone.slice(1)}`);
    expect(JSON.stringify(last().markup)).toContain(`m:${abel.id}`);
    expect(JSON.stringify(last().markup)).toContain(`m:${bethel.id}`);
    await post({
      callback_query: { id: 'cb', from, data: `m:${bethel.id}`, message: { message_id: 2, chat } },
    }).expect(200);
    expect(last().text).toContain('Bethel');

    // Read-only screens.
    await say('👤 መረጃዬ');
    expect(last().text).toContain(bethel.memberCode);
    await say('/attendance');
    expect(last().text).toContain('📅');
    await say('/courses');
    expect(last().text).toContain('🎓');
    await say('/qr');
    expect(last()).toMatchObject({ method: 'sendPhoto' });
    expect(last().text).toContain(bethel.memberCode);
    await say('/language');
    expect(last().text).toContain('English');
    await say('👤 My details');
    expect(last().text).toContain('Membership details');

    // Group chats are ignored (personal data).
    const before = sent.length;
    await post({
      message: { message_id: 3, chat: { id: -100123, type: 'group' }, from, text: '/profile' },
    }).expect(200);
    expect(sent.length).toBe(before);

    // Once the number leaves the records, access ends.
    await prisma.member.updateMany({ where: { phone }, data: { phone: null } });
    await say('/profile');
    expect(last().text).toContain('no longer');
    expect(await prisma.telegramLink.count({ where: { chatId: BigInt(userId) } })).toBe(0);
  });
});
