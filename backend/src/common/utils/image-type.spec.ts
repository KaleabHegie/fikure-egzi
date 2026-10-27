import { detectImageType } from './image-type.js';

describe('detectImageType', () => {
  it('recognizes JPEG, PNG and WebP by signature', () => {
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))?.ext).toBe('jpg');
    expect(
      detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.ext,
    ).toBe('png');
    expect(detectImageType(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'binary'))?.ext).toBe('webp');
  });

  it('rejects anything else, whatever it claims to be', () => {
    expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(detectImageType(Buffer.from('GIF89a'))).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
  });
});
