import JSEncrypt from 'jsencrypt'

/**
 * 使用项目 B 的公钥对敏感字段做 RSA 加密
 * @param {string} txt - 待加密文本
 * @returns {string} 加密后的字符串
 */
export function encrypt(txt) {
  const publicKey = 'MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAJL0JkqsUoK6kt3JyogsgqNp9VDGDp+t3ZAGMbVoMPdHNT2nfiIVh9ZMNHF7g2XiAa8O8AQWyh2PjMR0NiUSVQMCAwEAAQ=='
  const encryptor = new JSEncrypt()
  encryptor.setPublicKey(publicKey)
  return encryptor.encrypt(txt)
}
