import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import type { AppConfigService } from '../../config/app-config.service.js';
import { TelegramApi } from './telegram-api.js';

/** The client with its waits recorded instead of slept. */
class TestApi extends TelegramApi {
  waits: number[] = [];
  protected override sleep(ms: number) {
    this.waits.push(ms);
    return Promise.resolve();
  }
}

const reply = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('TelegramApi', () => {
  const fetchMock = jest.fn<typeof fetch>();
  let api: TestApi;

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    api = new TestApi({ telegram: { token: 'TOKEN' } } as unknown as AppConfigService);
  });

  it('waits out "too many requests" and retries instead of dropping the message', async () => {
    fetchMock
      .mockImplementationOnce(() =>
        reply({ ok: false, error_code: 429, parameters: { retry_after: 2 } }, 429),
      )
      .mockImplementationOnce(() => reply({ ok: true, result: { message_id: 7 } }));

    await expect(api.sendMessage(1n, 'hello')).resolves.toEqual({ message_id: 7 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(api.waits).toContain(2000);
  });

  it('gives up when Telegram asks for a long wait, or keeps refusing', async () => {
    fetchMock.mockImplementation(() =>
      reply({ ok: false, error_code: 429, parameters: { retry_after: 60 } }, 429),
    );
    await expect(api.sendMessage(1n, 'hello')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockReset();
    fetchMock.mockImplementation(() =>
      reply({ ok: false, error_code: 429, parameters: { retry_after: 1 } }, 429),
    );
    await expect(api.sendMessage(1n, 'hello')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3); // the first try and two retries
  });

  it('spaces sends out so a burst stays under Telegram’s rate', async () => {
    fetchMock.mockImplementation(() => reply({ ok: true, result: {} }));
    await Promise.all([
      api.sendMessage(1n, 'a'),
      api.sendMessage(2n, 'b'),
      api.sendMessage(3n, 'c'),
    ]);
    const paced = api.waits.filter((ms) => ms > 0);
    expect(paced).toHaveLength(2);
    expect(paced.every((ms) => ms <= 80)).toBe(true);
  });

  it('uploads a fixed picture once, then reuses Telegram’s copy', async () => {
    fetchMock.mockImplementation((_url, init) =>
      init?.body instanceof FormData
        ? reply({ ok: true, result: { photo: [{ file_id: 'small' }, { file_id: 'SEAL' }] } })
        : reply({ ok: true, result: { photo: [{ file_id: 'SEAL' }] } }),
    );
    const load = jest.fn(() =>
      Promise.resolve({ data: Buffer.from('png'), name: 'seal.png', mime: 'image/png' }),
    );

    await api.sendFixedPhoto('seal', 1n, load, 'welcome');
    await api.sendFixedPhoto('seal', 2n, load, 'welcome');

    expect(load).toHaveBeenCalledTimes(1);
    const second = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as { photo: string };
    expect(second.photo).toBe('SEAL');
  });

  it('uploads again when Telegram no longer knows the reused copy', async () => {
    const load = jest.fn(() =>
      Promise.resolve({ data: Buffer.from('png'), name: 'seal.png', mime: 'image/png' }),
    );
    fetchMock.mockImplementationOnce(() =>
      reply({ ok: true, result: { photo: [{ file_id: 'OLD' }] } }),
    );
    await api.sendFixedPhoto('seal', 1n, load, 'welcome');

    fetchMock
      .mockImplementationOnce(() => reply({ ok: false, description: 'wrong file identifier' }, 400))
      .mockImplementationOnce(() => reply({ ok: true, result: { photo: [{ file_id: 'NEW' }] } }));
    await expect(api.sendFixedPhoto('seal', 2n, load, 'welcome')).resolves.toBeTruthy();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
