/*
 * A JavaScript implementation of the Secure Hash Algorithm, SHA-1, as defined
 * in FIPS 180-1
 * Version 2.2 Copyright Paul Johnston 2000 - 2009.
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for details.
 */
// clang-format off
/* eslint-disable */
/**
 * @param {string} str
 * @return {string}
 */
ProductRegistryImpl.sha1 = function(str) {
  return rstr2hex(rstr_sha1(str2rstr_utf8(str)));

  /**
   * Calculate the SHA1 of a raw string
   * @param {string} s
   * @return {string}
   */
  function rstr_sha1(s)
  {
    return binb2rstr(binb_sha1(rstr2binb(s), s.length * 8));
  }

  /**
   * Convert a raw string to a hex string
   * @param {string} input
   * @return {string}
   */
  function rstr2hex(input)
  {
    let hex_tab = "0123456789abcdef";
    let output = "";
    let x;
    for(let i = 0; i < input.length; i++)
    {
      x = input.charCodeAt(i);
      output += hex_tab.charAt((x >>> 4) & 0x0F)
             +  hex_tab.charAt( x        & 0x0F);
    }
    return output;
  }

  /**
   * Encode a string as utf-8.
   * For efficiency, this assumes the input is valid utf-16.
   * @param {string} input
   * @return {string}
   */
  function str2rstr_utf8(input)
  {
    let output = "";
    let i = -1;
    let x, y;

    while(++i < input.length)
    {
      /* Decode utf-16 surrogate pairs */
      x = input.charCodeAt(i);
      y = i + 1 < input.length ? input.charCodeAt(i + 1) : 0;
      if(0xD800 <= x && x <= 0xDBFF && 0xDC00 <= y && y <= 0xDFFF)
      {
        x = 0x10000 + ((x & 0x03FF) << 10) + (y & 0x03FF);
        i++;
      }

      /* Encode output as utf-8 */
      if(x <= 0x7F)
        output += String.fromCharCode(x);
      else if(x <= 0x7FF)
        output += String.fromCharCode(0xC0 | ((x >>> 6 ) & 0x1F),
                                      0x80 | ( x         & 0x3F));
      else if(x <= 0xFFFF)
        output += String.fromCharCode(0xE0 | ((x >>> 12) & 0x0F),
                                      0x80 | ((x >>> 6 ) & 0x3F),
                                      0x80 | ( x         & 0x3F));
      else if(x <= 0x1FFFFF)
        output += String.fromCharCode(0xF0 | ((x >>> 18) & 0x07),
                                      0x80 | ((x >>> 12) & 0x3F),
                                      0x80 | ((x >>> 6 ) & 0x3F),
                                      0x80 | ( x         & 0x3F));
    }
    return output;
  }

  /**
   * Convert a raw string to an array of big-endian words
   * Characters >255 have their high-byte silently ignored.
   * @param {string} input
   * @return {!Array<number>}
   */
  function rstr2binb(input)
  {
    let output = Array(input.length >> 2);
    for(let i = 0; i < output.length; i++)
      output[i] = 0;
    for(let i = 0; i < input.length * 8; i += 8)
      output[i>>5] |= (input.charCodeAt(i / 8) & 0xFF) << (24 - i % 32);
    return output;
  }

  /**
   * Convert an array of big-endian words to a string
   * @param {!Array<number>} input
   * @return {string}
   */
  function binb2rstr(input)
  {
    let output = "";
    for(let i = 0; i < input.length * 32; i += 8)
      output += String.fromCharCode((input[i>>5] >>> (24 - i % 32)) & 0xFF);
    return output;
  }

  /**
   * Calculate the SHA-1 of an array of big-endian words, and a bit length
   * @param {!Array<number>} x
   * @param {number} len
   * @return {!Array<number>}
   */
  function binb_sha1(x, len)
  {
    /* append padding */
    x[len >> 5] |= 0x80 << (24 - len % 32);
    x[((len + 64 >> 9) << 4) + 15] = len;

    let w = Array(80);
    let a =  1732584193;
    let b = -271733879;
    let c = -1732584194;
    let d =  271733878;
    let e = -1009589776;

    for(let i = 0; i < x.length; i += 16)
    {
      let olda = a;
      let oldb = b;
      let oldc = c;
      let oldd = d;
      let olde = e;

      for(let j = 0; j < 80; j++)
      {
        if(j < 16) w[j] = x[i + j];
        else w[j] = bit_rol(w[j-3] ^ w[j-8] ^ w[j-14] ^ w[j-16], 1);
        let t = safe_add(safe_add(bit_rol(a, 5), sha1_ft(j, b, c, d)),
                         safe_add(safe_add(e, w[j]), sha1_kt(j)));
        e = d;
        d = c;
        c = bit_rol(b, 30);
        b = a;
        a = t;
      }

      a = safe_add(a, olda);
      b = safe_add(b, oldb);
      c = safe_add(c, oldc);
      d = safe_add(d, oldd);
      e = safe_add(e, olde);
    }
    return Array(a, b, c, d, e);

  }

  /**
   * Perform the appropriate triplet combination function for the current
   * iteration
   * @param {number} t
   * @param {number} b
   * @param {number} c
   * @param {number} d
   * @return {number}
   */
  function sha1_ft(t, b, c, d)
  {
    if(t < 20) return (b & c) | ((~b) & d);
    if(t < 40) return b ^ c ^ d;
    if(t < 60) return (b & c) | (b & d) | (c & d);
    return b ^ c ^ d;
  }

  /**
   * Determine the appropriate additive constant for the current iteration
   * @param {number} t
   * @return {number}
   */
  function sha1_kt(t)
  {
    return (t < 20) ?  1518500249 : (t < 40) ?  1859775393 :
           (t < 60) ? -1894007588 : -899497514;
  }

  /**
   * Add integers, wrapping at 2^32. This uses 16-bit operations internally
   * to work around bugs in some JS interpreters.
   * @param {number} x
   * @param {number} y
   * @return {number}
   */
  function safe_add(x, y)
  {
    let lsw = (x & 0xFFFF) + (y & 0xFFFF);
    let msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xFFFF);
  }

  /**
   * Bitwise rotate a 32-bit number to the left.
   * @param {number} num
   * @param {number} cnt
   * @return {number}
   */
  function bit_rol(num, cnt)
  {
    return (num << cnt) | (num >>> (32 - cnt));
  }
};
