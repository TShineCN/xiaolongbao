/**
 * 基于TypedArray的高性能GIF编码器
 * 模拟WASM性能，使用纯JavaScript实现
 */
class WasmGifEncoder {
    constructor() {
        this.frames = [];
        this.width = 0;
        this.height = 0;
        this.delay = 200;
        this.onProgress = null;
        this.quantizer = new ColorQuantizer();
        console.log('WASM风格GIF编码器初始化');
    }

    /**
     * 添加帧
     */
    addFrame(canvas, options = {}) {
        const delay = options.delay || this.delay;
        
        if (this.width === 0) {
            this.width = canvas.width;
            this.height = canvas.height;
        }
        
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // 使用Uint32Array提高性能
        const pixelData = new Uint32Array(imageData.data.buffer);
        
        this.frames.push({
            pixels: new Uint32Array(pixelData),
            width: canvas.width,
            height: canvas.height,
            delay: delay
        });
        
        console.log(`WASM编码器添加帧 ${this.frames.length}`);
    }

    /**
     * 生成GIF
     */
    encode() {
        console.log('开始WASM风格编码');
        
        if (this.frames.length === 0) {
            throw new Error('没有帧数据');
        }

        // 分析所有帧的颜色
        const globalPalette = this.quantizer.createGlobalPalette(this.frames);
        
        // 创建GIF数据
        const buffer = new GifBuffer();
        
        // 写入GIF头部
        buffer.writeString('GIF89a');
        buffer.writeUint16(this.width);
        buffer.writeUint16(this.height);
        
        // 全局颜色表信息
        const globalColorTableFlag = 1;
        const colorResolution = 7; // 8位
        const sortFlag = 0;
        const globalColorTableSize = Math.ceil(Math.log2(globalPalette.length)) - 1;
        
        const packed = (globalColorTableFlag << 7) |
                      (colorResolution << 4) |
                      (sortFlag << 3) |
                      globalColorTableSize;
        
        buffer.writeByte(packed);
        buffer.writeByte(0); // 背景颜色索引
        buffer.writeByte(0); // 像素长宽比
        
        // 写入全局颜色表
        for (const color of globalPalette) {
            buffer.writeByte((color >> 16) & 0xFF); // R
            buffer.writeByte((color >> 8) & 0xFF);  // G
            buffer.writeByte(color & 0xFF);         // B
        }
        
        // 填充颜色表到2的幂次
        const tableSize = 1 << (globalColorTableSize + 1);
        for (let i = globalPalette.length; i < tableSize; i++) {
            buffer.writeByte(0);
            buffer.writeByte(0);
            buffer.writeByte(0);
        }
        
        // 应用扩展（循环）
        buffer.writeString('\x21\xFF\x0BNETSCAPE2.0\x03\x01\x00\x00\x00');
        
        // 编码每一帧
        for (let i = 0; i < this.frames.length; i++) {
            if (this.onProgress) {
                this.onProgress(i / this.frames.length);
            }
            
            this.encodeFrame(buffer, this.frames[i], globalPalette);
        }
        
        // GIF结尾
        buffer.writeByte(0x3B);
        
        if (this.onProgress) {
            this.onProgress(1.0);
        }
        
        console.log(`WASM编码完成: ${buffer.length} 字节`);
        return buffer.toUint8Array();
    }

    /**
     * 编码单帧
     */
    encodeFrame(buffer, frame, palette) {
        // 图形控制扩展
        buffer.writeByte(0x21); // 扩展介绍符
        buffer.writeByte(0xF9); // 图形控制标签
        buffer.writeByte(0x04); // 块大小
        buffer.writeByte(0x00); // 处置方法
        
        const delay = Math.max(1, Math.round(frame.delay / 10));
        buffer.writeUint16(delay);
        
        buffer.writeByte(0x00); // 透明颜色索引
        buffer.writeByte(0x00); // 块终止符
        
        // 图像描述符
        buffer.writeByte(0x2C); // 图像分离符
        buffer.writeUint16(0);  // 左偏移
        buffer.writeUint16(0);  // 顶偏移
        buffer.writeUint16(frame.width);
        buffer.writeUint16(frame.height);
        buffer.writeByte(0x00); // 无局部颜色表
        
        // 转换像素为调色板索引
        const indices = this.quantizer.quantizeFrame(frame.pixels, palette);
        
        // LZW压缩
        const compressed = this.lzwCompress(indices, palette.length);
        
        // 写入压缩数据
        buffer.writeDataSubBlocks(compressed);
    }

    /**
     * LZW压缩
     */
    lzwCompress(indices, colorCount) {
        const minCodeSize = Math.max(2, Math.ceil(Math.log2(colorCount)));
        const clearCode = 1 << minCodeSize;
        const endCode = clearCode + 1;
        
        let codeSize = minCodeSize + 1;
        let nextCode = endCode + 1;
        
        const output = [minCodeSize];
        let bitBuffer = 0;
        let bitCount = 0;
        const compressed = [];
        
        const writeBits = (code, bits) => {
            bitBuffer |= code << bitCount;
            bitCount += bits;
            
            while (bitCount >= 8) {
                compressed.push(bitBuffer & 0xFF);
                bitBuffer >>= 8;
                bitCount -= 8;
            }
        };
        
        // 字典
        const dictionary = new Map();
        
        // 初始化字典
        for (let i = 0; i < clearCode; i++) {
            dictionary.set(String(i), i);
        }
        dictionary.set('clear', clearCode);
        dictionary.set('end', endCode);
        
        writeBits(clearCode, codeSize);
        
        let string = String(indices[0]);
        
        for (let i = 1; i < indices.length; i++) {
            const char = String(indices[i]);
            const stringChar = string + ',' + char;
            
            if (dictionary.has(stringChar)) {
                string = stringChar;
            } else {
                writeBits(dictionary.get(string), codeSize);
                
                if (nextCode < 4096) {
                    dictionary.set(stringChar, nextCode++);
                    
                    if (nextCode >= (1 << codeSize) && codeSize < 12) {
                        codeSize++;
                    }
                }
                
                string = char;
            }
        }
        
        writeBits(dictionary.get(string), codeSize);
        writeBits(endCode, codeSize);
        
        if (bitCount > 0) {
            compressed.push(bitBuffer & 0xFF);
        }
        
        return [minCodeSize, ...compressed];
    }

    /**
     * 创建Blob
     */
    createBlob() {
        const data = this.encode();
        return new Blob([data], { type: 'image/gif' });
    }
}

/**
 * 颜色量化器
 */
class ColorQuantizer {
    createGlobalPalette(frames) {
        console.log('创建全局调色板');
        
        const colorCounts = new Map();
        
        // 统计所有颜色
        for (const frame of frames) {
            for (const pixel of frame.pixels) {
                const color = pixel & 0xFFFFFF; // 忽略alpha
                colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
            }
        }
        
        // 按使用频率排序
        const sortedColors = Array.from(colorCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(entry => entry[0]);
        
        // 取前256种颜色
        return sortedColors.slice(0, 256);
    }
    
    quantizeFrame(pixels, palette) {
        const indices = new Uint8Array(pixels.length);
        
        for (let i = 0; i < pixels.length; i++) {
            const pixel = pixels[i] & 0xFFFFFF;
            indices[i] = this.findClosestColor(pixel, palette);
        }
        
        return indices;
    }
    
    findClosestColor(pixel, palette) {
        let bestIndex = 0;
        let bestDistance = Infinity;
        
        const r1 = (pixel >> 16) & 0xFF;
        const g1 = (pixel >> 8) & 0xFF;
        const b1 = pixel & 0xFF;
        
        for (let i = 0; i < palette.length; i++) {
            const color = palette[i];
            const r2 = (color >> 16) & 0xFF;
            const g2 = (color >> 8) & 0xFF;
            const b2 = color & 0xFF;
            
            const distance = (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
            
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = i;
            }
        }
        
        return bestIndex;
    }
}

/**
 * GIF数据缓冲区
 */
class GifBuffer {
    constructor() {
        this.data = [];
    }
    
    writeByte(value) {
        this.data.push(value & 0xFF);
    }
    
    writeUint16(value) {
        this.data.push(value & 0xFF);
        this.data.push((value >> 8) & 0xFF);
    }
    
    writeString(str) {
        for (let i = 0; i < str.length; i++) {
            this.data.push(str.charCodeAt(i));
        }
    }
    
    writeDataSubBlocks(data) {
        let offset = 0;
        while (offset < data.length) {
            const blockSize = Math.min(255, data.length - offset);
            this.writeByte(blockSize);
            
            for (let i = 0; i < blockSize; i++) {
                this.writeByte(data[offset + i]);
            }
            offset += blockSize;
        }
        this.writeByte(0); // 终止符
    }
    
    get length() {
        return this.data.length;
    }
    
    toUint8Array() {
        return new Uint8Array(this.data);
    }
}

// 导出
if (typeof window !== 'undefined') {
    window.WasmGifEncoder = WasmGifEncoder;
}