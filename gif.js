/*
  gif.js 0.2.0 - https://github.com/jnordberg/gif.js
  Optimized for local use without web workers
*/
(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.GIF = f()}})(function(){
  
  function GIF(options) {
    var key, val;
    this.running = false;
    this.options = {};
    this.frames = [];
    this.freeWorkers = [];
    this.activeWorkers = [];
    this.setOptions(options);
    for (key in this.options) {
      val = this.options[key];
      this[key] = val;
    }
  }

  GIF.prototype.setOption = function(key, val) {
    this.options[key] = val;
    return this[key] = val;
  };

  GIF.prototype.setOptions = function(options) {
    var key, val;
    options = options || {};
    for (key in options) {
      if (!options.hasOwnProperty(key)) continue;
      val = options[key];
      this.setOption(key, val);
    }
  };

  GIF.prototype.addFrame = function(image, options) {
    var frame;
    options = options || {};
    frame = {};
    frame.transparent = this.transparent;
    for (var key in options) {
      if (!options.hasOwnProperty(key)) continue;
      frame[key] = options[key];
    }
    if (this.width == null) {
      this.setOption('width', image.width);
    }
    if (this.height == null) {
      this.setOption('height', image.height);
    }
    if (typeof ImageData !== "undefined" && ImageData !== null && image instanceof ImageData) {
      frame.data = image.data;
    } else if (typeof CanvasRenderingContext2D !== "undefined" && CanvasRenderingContext2D !== null && image instanceof CanvasRenderingContext2D || typeof WebGLRenderingContext !== "undefined" && WebGLRenderingContext !== null && image instanceof WebGLRenderingContext) {
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
    ctx.setFill = this.background;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.drawImage(image, 0, 0);
    return ctx.getImageData(0, 0, this.width, this.height).data;
  };

  GIF.prototype.render = function() {
    var data = this.generateGIF();
    var blob = new Blob([data], {type: 'image/gif'});
    this.emit('finished', blob, data);
    return blob;
  };

  GIF.prototype.generateGIF = function() {
    var i, frame;
    var buf = new Uint8Array(this.width * this.height * this.frames.length * 5);
    var p = 0;
    
    // Header
    var header = 'GIF89a';
    for (i = 0; i < header.length; i++) {
      buf[p++] = header.charCodeAt(i);
    }
    
    // Logical Screen Descriptor
    buf[p++] = this.width & 0xff;
    buf[p++] = (this.width >> 8) & 0xff;
    buf[p++] = this.height & 0xff;
    buf[p++] = (this.height >> 8) & 0xff;
    buf[p++] = 0x87; // global color table flag + color resolution + sort flag + global color table size
    buf[p++] = 0x00; // background color index
    buf[p++] = 0x00; // pixel aspect ratio
    
    // Global Color Table (8 colors)
    var colors = [
      [0x00, 0x00, 0x00], // black
      [0xFF, 0xFF, 0xFF], // white
      [0xFF, 0x00, 0x00], // red
      [0x00, 0xFF, 0x00], // green
      [0x00, 0x00, 0xFF], // blue
      [0xFF, 0xFF, 0x00], // yellow
      [0xFF, 0x00, 0xFF], // magenta
      [0x00, 0xFF, 0xFF]  // cyan
    ];
    
    for (i = 0; i < colors.length; i++) {
      buf[p++] = colors[i][0];
      buf[p++] = colors[i][1];
      buf[p++] = colors[i][2];
    }
    
    // Application Extension (for looping)
    buf[p++] = 0x21; // extension introducer
    buf[p++] = 0xFF; // application extension label
    buf[p++] = 0x0B; // block size
    var netscape = 'NETSCAPE2.0';
    for (i = 0; i < netscape.length; i++) {
      buf[p++] = netscape.charCodeAt(i);
    }
    buf[p++] = 0x03; // sub-block size
    buf[p++] = 0x01; // loop indicator
    buf[p++] = 0x00; // loop count low byte
    buf[p++] = 0x00; // loop count high byte
    buf[p++] = 0x00; // block terminator
    
    // Process frames
    for (var frameIndex = 0; frameIndex < this.frames.length; frameIndex++) {
      frame = this.frames[frameIndex];
      
      // Graphics Control Extension
      buf[p++] = 0x21; // extension introducer
      buf[p++] = 0xF9; // graphic control label
      buf[p++] = 0x04; // block size
      buf[p++] = 0x00; // packed field
      
      var delay = Math.max(1, Math.round((frame.delay || this.delay || 500) / 10));
      buf[p++] = delay & 0xff;
      buf[p++] = (delay >> 8) & 0xff;
      buf[p++] = 0x00; // transparent color index
      buf[p++] = 0x00; // block terminator
      
      // Image Descriptor
      buf[p++] = 0x2C; // image separator
      buf[p++] = 0x00; // left position low byte
      buf[p++] = 0x00; // left position high byte
      buf[p++] = 0x00; // top position low byte
      buf[p++] = 0x00; // top position high byte
      buf[p++] = this.width & 0xff;
      buf[p++] = (this.width >> 8) & 0xff;
      buf[p++] = this.height & 0xff;
      buf[p++] = (this.height >> 8) & 0xff;
      buf[p++] = 0x00; // packed field
      
      // Get image data
      var imageData;
      if (frame.data) {
        imageData = frame.data;
      } else if (frame.context) {
        imageData = this.getContextData(frame.context);
      } else if (frame.image) {
        imageData = this.getImageData(frame.image);
      }
      
      // Convert to indexed color
      var indices = [];
      for (i = 0; i < imageData.length; i += 4) {
        var r = imageData[i];
        var g = imageData[i + 1];
        var b = imageData[i + 2];
        var a = imageData[i + 3];
        
        if (a < 128) {
          indices.push(0); // transparent -> black
        } else {
          // Simple color quantization
          var gray = (r + g + b) / 3;
          if (gray < 32) indices.push(0); // black
          else if (gray < 96) indices.push(0); // black
          else if (gray < 160) indices.push(7); // light gray -> cyan
          else indices.push(1); // white
        }
      }
      
      // LZW compression (simplified)
      buf[p++] = 0x02; // LZW minimum code size
      
      // Simple LZW encoding
      var codes = [];
      var clearCode = 4;
      var endCode = 5;
      
      codes.push(clearCode);
      for (i = 0; i < indices.length; i++) {
        codes.push(indices[i]);
      }
      codes.push(endCode);
      
      // Pack codes into bytes
      var bitBuffer = 0;
      var bitCount = 0;
      var codeSize = 3;
      var packed = [];
      
      for (i = 0; i < codes.length; i++) {
        bitBuffer |= (codes[i] << bitCount);
        bitCount += codeSize;
        
        while (bitCount >= 8) {
          packed.push(bitBuffer & 0xFF);
          bitBuffer >>= 8;
          bitCount -= 8;
        }
      }
      
      if (bitCount > 0) {
        packed.push(bitBuffer & 0xFF);
      }
      
      // Write in 255-byte blocks
      var pos = 0;
      while (pos < packed.length) {
        var blockSize = Math.min(255, packed.length - pos);
        buf[p++] = blockSize;
        for (i = 0; i < blockSize; i++) {
          buf[p++] = packed[pos + i];
        }
        pos += blockSize;
      }
      
      buf[p++] = 0x00; // block terminator
    }
    
    // GIF Trailer
    buf[p++] = 0x3B;
    
    return buf.slice(0, p);
  };

  GIF.prototype.emit = function(event, data) {
    if (this.listeners && this.listeners[event]) {
      for (var i = 0; i < this.listeners[event].length; i++) {
        this.listeners[event][i].call(this, data);
      }
    }
  };

  GIF.prototype.on = function(event, callback) {
    if (!this.listeners) this.listeners = {};
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  };

  // Default options
  GIF.prototype.setOptions({
    width: null,
    height: null,
    quality: 10,
    workers: 0,
    repeat: 0,
    background: '#fff',
    transparent: null,
    delay: 500,
    copy: false
  });

  return GIF;
});