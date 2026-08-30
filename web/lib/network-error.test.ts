import { vi, beforeEach, afterEach } from 'vitest';
import { login } from './api';
import { streamAuthoringChat } from './authoring-chat';
import { streamReviewTutorChat } from './review-tutor';

/**
 * 네트워크 자체가 끊겼을 때 사용자에게 무엇이 보이는가.
 *
 * fetch는 연결 실패를 `TypeError: Failed to fetch`로 던진다. 이 문자열이 그대로
 * 화면까지 올라오면 (1) 한국어 UI에 영어 원문이 섞이고 (2) 사용자는 무엇을 해야
 * 하는지 알 수 없다. 실제로 API 주소 설정이 빠졌을 때 이 문자열만 덩그러니 떴다.
 *
 * 각 호출 지점이 저마다 처리하면 또 빠지는 곳이 생기므로, fetch를 감싸는 한 곳에서
 * 바꾼다. 원래 오류는 cause로 남겨 디버깅을 막지 않는다.
 */
const NETWORK_FAIL = /서버에 연결하지 못했어요/;

const failNetwork = () =>
  vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('네트워크 실패 메시지', () => {
  it('apiFetch: 원문 대신 한국어 안내를 던진다', async () => {
    vi.stubGlobal('fetch', failNetwork());
    await expect(login('a@b.com', 'pw12345678')).rejects.toThrow(NETWORK_FAIL);
  });

  it('apiFetch: 원래 오류를 cause로 남긴다', async () => {
    vi.stubGlobal('fetch', failNetwork());
    const err = await login('a@b.com', 'pw12345678').catch((e: Error) => e);
    expect((err as Error).cause).toBeInstanceOf(TypeError);
  });

  it('출제 채팅 스트림: onError로 한국어 안내를 넘긴다', async () => {
    vi.stubGlobal('fetch', failNetwork());
    const onError = vi.fn();
    await streamAuthoringChat(
      { message: 'ping' } as Parameters<typeof streamAuthoringChat>[0],
      { onDelta: () => undefined, onDone: () => undefined, onError },
    ).catch(() => undefined);
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(NETWORK_FAIL));
  });

  it('오답 튜터 스트림: onError로 한국어 안내를 넘긴다', async () => {
    vi.stubGlobal('fetch', failNetwork());
    const onError = vi.fn();
    await streamReviewTutorChat(
      { questionId: 'q1', message: 'ping' } as Parameters<typeof streamReviewTutorChat>[0],
      { onDelta: () => undefined, onDone: () => undefined, onError },
    ).catch(() => undefined);
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(NETWORK_FAIL));
  });
});
