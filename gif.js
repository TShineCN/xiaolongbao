/*
  gif.js 0.2.0 - https://github.com/jnordberg/gif.js
  Local version with embedded worker for GitHub Pages compatibility
*/
(function() {
  var GIF = function(options) {
    var defaults, key;
    this.running = false;
    this.options = {};
    this.frames = [];
    this.freeWorkers = [];
    this.activeWorkers = [];
    this.setOptions(options);
    
    // Set default options
    defaults = {
      workers: 0,
      quality: 10,
      width: null,
      height: null,
      transparent: null,
      background: '#fff',
      repeat: 0,
      delay: 500,
      copy: false,
      workerScript: null
    };
    
    for (key in defaults) {
      if (this.options[key] == null) {
        this.options[key] = defaults[key];
      }
    }
    
    for (key in this.options) {
      this[key] = this.options[key];
    }
  };

  GIF.prototype.setOption = function(key, value) {
    this.options[key] = value;
    return this[key] = value;
  };

  GIF.prototype.setOptions = function(options) {
    var key, value;
    if (options == null) { options = {}; }
    for (key in options) {
      if (!options.hasOwnProperty(key)) continue;
      value = options[key];
      this.setOption(key, value);
    }
  };

  GIF.prototype.addFrame = function(image, options) {
    var frame, key;
    if (options == null) { options = {}; }
    frame = {};
    frame.transparent = this.transparent;
    
    for (key in options) {
      if (!options.hasOwnProperty(key)) continue;
      frame[key] = options[key];
    }
    
    if (this.width == null) {
      this.setOption('width', image.width || image.canvas && image.canvas.width);
    }
    if (this.height == null) {
      this.setOption('height', image.height || image.canvas && image.canvas.height);
    }
    
    if ((typeof ImageData !== "undefined" && ImageData !== null) && image instanceof ImageData) {
      frame.data = image.data;
    } else if (((typeof CanvasRenderingContext2D !== "undefined" && CanvasRenderingContext2D !== null) && image instanceof CanvasRenderingContext2D) || ((typeof WebGLRenderingContext !== "undefined" && WebGLRenderingContext !== null) && image instanceof WebGLRenderingContext)) {
      if (options.copy !== false) {
        frame.data = this.getContextData(image);
      } else {
        frame.context = image;
      }
    } else if (image.childNodes != null) {
      if (options.copy !== false) {
        frame.data = this.getImageData(image);
      } else {
        frame.image = image;
      }
    } else {
      throw new Error("Invalid image");
    }
    
    return this.frames.push(frame);
  };

  GIF.prototype.getContextData = function(ctx) {
    return ctx.getImageData(0, 0, this.width, this.height).data;
  };

  GIF.prototype.getImageData = function(image) {
    var ctx;
    if (this._canvas == null) {
      this._canvas = document.createElement('canvas');
      this._canvas.width = this.width;
      this._canvas.height = this.height;
    }
    ctx = this._canvas.getContext('2d');
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.drawImage(image, 0, 0);
    return ctx.getImageData(0, 0, this.width, this.height).data;
  };

  GIF.prototype.render = function() {
    var i, frame;
    this.running = true;
    
    // Since we're not using workers, render immediately
    setTimeout(() => {
      try {
        var gifData = this.renderFrames();
        var blob = new Blob([gifData], { type: 'image/gif' });
        this.emit('finished', blob);
        this.running = false;
      } catch (error) {
        this.emit('error', error);
        this.running = false;
      }
    }, 1);
  };

  GIF.prototype.renderFrames = function() {
    var i, frame, imageData;
    var encoder = new GIFEncoder(this.width, this.height);
    
    encoder.setRepeat(this.repeat);
    encoder.setQuality(this.quality);
    encoder.writeHeader();
    
    for (i = 0; i < this.frames.length; i++) {
      frame = this.frames[i];
      
      if (frame.data) {
        imageData = frame.data;
      } else if (frame.context) {
        imageData = this.getContextData(frame.context);
      } else if (frame.image) {
        imageData = this.getImageData(frame.image);
      }
      
      encoder.setDelay(frame.delay || this.delay);
      encoder.addFrame(imageData);
      
      // Emit progress
      this.emit('progress', (i + 1) / this.frames.length);
    }
    
    encoder.finish();
    return encoder.stream.getData();
  };

  GIF.prototype.emit = function(event) {
    var args = Array.prototype.slice.call(arguments, 1);
    if (this['on' + event]) {
      this['on' + event].apply(this, args);
    }
    if (this.listeners && this.listeners[event]) {
      for (var i = 0; i < this.listeners[event].length; i++) {
        this.listeners[event][i].apply(this, args);
      }
    }
  };

  GIF.prototype.on = function(event, callback) {
    if (!this.listeners) this.listeners = {};
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  };

  // Simple GIF Encoder
  function GIFEncoder(width, height) {
    this.width = width;
    this.height = height;
    this.stream = new ByteArray();
    this.pixels = null;
    this.indexedPixels = null;
    this.colorDepth = null;
    this.colorTab = null;
    this.usedEntry = [];
    this.palSize = 7;
    this.dispose = -1;
    this.firstFrame = true;
    this.sample = 10;
    this.delay = 0;
    this.repeat = -1;
  }

  GIFEncoder.prototype.setDelay = function(ms) {
    this.delay = Math.round(ms / 10);
  };

  GIFEncoder.prototype.setRepeat = function(iter) {
    this.repeat = iter;
  };

  GIFEncoder.prototype.setQuality = function(quality) {
    if (quality < 1) quality = 1;
    this.sample = quality;
  };

  GIFEncoder.prototype.writeHeader = function() {
    this.writeString("GIF89a");
    this.writeShort(this.width);
    this.writeShort(this.height);
    this.stream.writeByte(0x80 | this.palSize); // Global color table flag
    this.stream.writeByte(0); // Background color index
    this.stream.writeByte(0); // Pixel aspect ratio
  };

  GIFEncoder.prototype.addFrame = function(imageData) {
    this.getImagePixels(imageData);
    this.analyzePixels();
    if (this.firstFrame) {
      this.writeLSD();
      this.writePalette();
      if (this.repeat >= 0) {
        this.writeNetscapeExt();
      }
    }
    this.writeGraphicCtrlExt();
    this.writeImageDesc();
    if (!this.firstFrame) {
      this.writePalette();
    }
    this.writePixels();
    this.firstFrame = false;
  };

  GIFEncoder.prototype.finish = function() {
    this.stream.writeByte(0x3b); // GIF trailer
  };

  GIFEncoder.prototype.writeLSD = function() {
    // Global color table
    var palette = this.colorTab;
    for (var i = 0; i < 256; i++) {
      if (i < palette.length / 3) {
        this.stream.writeByte(palette[i * 3]);
        this.stream.writeByte(palette[i * 3 + 1]);
        this.stream.writeByte(palette[i * 3 + 2]);
      } else {
        this.stream.writeByte(0);
        this.stream.writeByte(0);
        this.stream.writeByte(0);
      }
    }
  };

  GIFEncoder.prototype.writeNetscapeExt = function() {
    this.stream.writeByte(0x21); // Extension introducer
    this.stream.writeByte(0xff); // Application extension label
    this.stream.writeByte(11); // Block size
    this.writeString("NETSCAPE2.0");
    this.stream.writeByte(3); // Sub-block size
    this.stream.writeByte(1); // Loop indicator
    this.writeShort(this.repeat); // Loop count
    this.stream.writeByte(0); // Block terminator
  };

  GIFEncoder.prototype.writeGraphicCtrlExt = function() {
    this.stream.writeByte(0x21); // Extension introducer
    this.stream.writeByte(0xf9); // Graphic control label
    this.stream.writeByte(4); // Block size
    this.stream.writeByte(0); // Packed field
    this.writeShort(this.delay); // Delay time
    this.stream.writeByte(0); // Transparent color index
    this.stream.writeByte(0); // Block terminator
  };

  GIFEncoder.prototype.writeImageDesc = function() {
    this.stream.writeByte(0x2c); // Image separator
    this.writeShort(0); // Left
    this.writeShort(0); // Top
    this.writeShort(this.width); // Width
    this.writeShort(this.height); // Height
    this.stream.writeByte(0); // Packed field
  };

  GIFEncoder.prototype.writePalette = function() {
    // Palette is written in writeLSD for global color table
  };

  GIFEncoder.prototype.writePixels = function() {
    var encoder = new LZWEncoder(this.width, this.height, this.indexedPixels, 8);
    encoder.encode(this.stream);
  };

  GIFEncoder.prototype.writeShort = function(value) {
    this.stream.writeByte(value & 0xff);
    this.stream.writeByte((value >> 8) & 0xff);
  };

  GIFEncoder.prototype.writeString = function(s) {
    for (var i = 0; i < s.length; i++) {
      this.stream.writeByte(s.charCodeAt(i));
    }
  };

  GIFEncoder.prototype.getImagePixels = function(imageData) {
    var w = this.width;
    var h = this.height;
    this.pixels = new Array(w * h * 3);
    
    var data = imageData;
    var count = 0;
    
    for (var i = 0; i < h; i++) {
      for (var j = 0; j < w; j++) {
        var b = (i * w + j) * 4;
        this.pixels[count++] = data[b];     // Red
        this.pixels[count++] = data[b + 1]; // Green
        this.pixels[count++] = data[b + 2]; // Blue
      }
    }
  };

  GIFEncoder.prototype.analyzePixels = function() {
    var len = this.pixels.length;
    var nPix = len / 3;
    this.indexedPixels = new Array(nPix);
    
    // Simple quantization - convert to 256 colors
    var colorTab = [];
    var colorMap = {};
    var colorIndex = 0;
    
    for (var i = 0; i < len; i += 3) {
      var r = this.pixels[i] & 0xf8;     // 5 bits
      var g = this.pixels[i + 1] & 0xf8; // 5 bits  
      var b = this.pixels[i + 2] & 0xf8; // 5 bits
      
      var color = (r << 16) | (g << 8) | b;
      var index = colorMap[color];
      
      if (index === undefined) {
        if (colorIndex < 256) {
          colorTab.push(r, g, b);
          colorMap[color] = colorIndex;
          index = colorIndex++;
        } else {
          // Find closest color
          index = this.findClosest(r, g, b, colorTab);
        }
      }
      
      this.indexedPixels[i / 3] = index;
    }
    
    // Pad color table to 256 entries
    while (colorTab.length < 768) {
      colorTab.push(0);
    }
    
    this.colorTab = colorTab;
  };

  GIFEncoder.prototype.findClosest = function(r, g, b, colorTab) {
    var minDist = 256 * 256 * 256;
    var closest = 0;
    
    for (var i = 0; i < colorTab.length; i += 3) {
      var dr = r - colorTab[i];
      var dg = g - colorTab[i + 1];
      var db = b - colorTab[i + 2];
      var dist = dr * dr + dg * dg + db * db;
      
      if (dist < minDist) {
        minDist = dist;
        closest = i / 3;
      }
    }
    
    return closest;
  };

  // ByteArray implementation
  function ByteArray() {
    this.data = [];
  }

  ByteArray.prototype.writeByte = function(val) {
    this.data.push(val & 0xff);
  };

  ByteArray.prototype.getData = function() {
    return new Uint8Array(this.data);
  };

  // LZW Encoder
  function LZWEncoder(width, height, pixels, colorDepth) {
    this.initCodeSize = Math.max(2, colorDepth);
    this.accum = new Array(256);
    this.htab = new Array(5003);
    this.codetab = new Array(5003);
    this.cur_accum = 0;
    this.cur_bits = 0;
    this.masks = [0x0000, 0x0001, 0x0003, 0x0007, 0x000F, 0x001F, 0x003F, 0x007F, 0x00FF, 0x01FF, 0x03FF, 0x07FF, 0x0FFF, 0x1FFF, 0x3FFF, 0x7FFF, 0xFFFF];
    this.a_count = 0;
    this.free_ent = 0;
    this.maxcode = 0;
    this.clear_flg = false;
    this.g_init_bits = this.initCodeSize;
    this.ClearCode = 1 << (this.initCodeSize - 1);
    this.EOFCode = this.ClearCode + 1;
    this.free_ent = this.ClearCode + 2;
    this.n_bits = this.g_init_bits;
    this.maxcode = this.MAXCODE(this.n_bits);
    this.pixels = pixels;
    this.pixelIndex = 0;
  }

  LZWEncoder.prototype.MAXCODE = function(n_bits) {
    return (1 << n_bits) - 1;
  };

  LZWEncoder.prototype.encode = function(outs) {
    outs.writeByte(this.initCodeSize); // Write "initial code size" byte
    
    this.remaining = this.pixels.length;
    this.curPixel = 0;
    
    this.compress(this.initCodeSize + 1, outs);
    
    outs.writeByte(0); // Write block terminator
  };

  LZWEncoder.prototype.compress = function(init_bits, outs) {
    var fcode, c, i, ent, disp, hsize_reg, hshift;
    
    this.g_init_bits = init_bits;
    this.clear_flg = false;
    this.n_bits = this.g_init_bits;
    this.maxcode = this.MAXCODE(this.n_bits);
    
    this.ClearCode = 1 << (init_bits - 1);
    this.EOFCode = this.ClearCode + 1;
    this.free_ent = this.ClearCode + 2;
    
    this.a_count = 0;
    
    ent = this.nextPixel();
    
    hshift = 0;
    for (fcode = 5003; fcode < 65536; fcode *= 2) {
      hshift++;
    }
    hshift = 8 - hshift;
    hsize_reg = 5003;
    this.cl_hash(hsize_reg);
    
    this.output(this.ClearCode, outs);
    
    while ((c = this.nextPixel()) != -1) {
      fcode = (c << 12) + ent;
      i = (c << hshift) ^ ent;
      
      if (this.htab[i] == fcode) {
        ent = this.codetab[i];
        continue;
      } else if (this.htab[i] >= 0) {
        disp = hsize_reg - i;
        if (i == 0) disp = 1;
        do {
          if ((i -= disp) < 0) i += hsize_reg;
          if (this.htab[i] == fcode) {
            ent = this.codetab[i];
            break;
          }
        } while (this.htab[i] >= 0);
        
        if (this.htab[i] == fcode) {
          ent = this.codetab[i];
          continue;
        }
      }
      
      this.output(ent, outs);
      ent = c;
      
      if (this.free_ent < (1 << 12)) {
        this.codetab[i] = this.free_ent++;
        this.htab[i] = fcode;
      } else {
        this.cl_block(outs);
      }
    }
    
    this.output(ent, outs);
    this.output(this.EOFCode, outs);
  };

  LZWEncoder.prototype.output = function(code, outs) {
    this.cur_accum &= this.masks[this.cur_bits];
    
    if (this.cur_bits > 0) {
      this.cur_accum |= (code << this.cur_bits);
    } else {
      this.cur_accum = code;
    }
    
    this.cur_bits += this.n_bits;
    
    while (this.cur_bits >= 8) {
      this.char_out((this.cur_accum & 0xff), outs);
      this.cur_accum >>= 8;
      this.cur_bits -= 8;
    }
    
    if (this.free_ent > this.maxcode || this.clear_flg) {
      if (this.clear_flg) {
        this.maxcode = this.MAXCODE(this.n_bits = this.g_init_bits);
        this.clear_flg = false;
      } else {
        this.n_bits++;
        if (this.n_bits == 12) {
          this.maxcode = (1 << 12);
        } else {
          this.maxcode = this.MAXCODE(this.n_bits);
        }
      }
    }
    
    if (code == this.EOFCode) {
      while (this.cur_bits > 0) {
        this.char_out((this.cur_accum & 0xff), outs);
        this.cur_accum >>= 8;
        this.cur_bits -= 8;
      }
      this.flush_char(outs);
    }
  };

  LZWEncoder.prototype.char_out = function(c, outs) {
    this.accum[this.a_count++] = c;
    if (this.a_count >= 254) this.flush_char(outs);
  };

  LZWEncoder.prototype.flush_char = function(outs) {
    if (this.a_count > 0) {
      outs.writeByte(this.a_count);
      for (var i = 0; i < this.a_count; i++) {
        outs.writeByte(this.accum[i]);
      }
      this.a_count = 0;
    }
  };

  LZWEncoder.prototype.cl_block = function(outs) {
    this.cl_hash(5003);
    this.free_ent = this.ClearCode + 2;
    this.clear_flg = true;
    this.output(this.ClearCode, outs);
  };

  LZWEncoder.prototype.cl_hash = function(hsize) {
    for (var i = 0; i < hsize; ++i) {
      this.htab[i] = -1;
    }
  };

  LZWEncoder.prototype.nextPixel = function() {
    if (this.remaining === 0) return -1;
    this.remaining--;
    var pix = this.pixels[this.curPixel++];
    return pix & 0xff;
  };

  // Export GIF globally
  if (typeof window !== 'undefined') {
    window.GIF = GIF;
  } else if (typeof module !== 'undefined' && module.exports) {
    module.exports = GIF;
  }

})();