/**
 * 简单可靠的GIF编码器
 * 专注于正确性而不是复杂功能
 */
class SimpleGifEncoder {
    constructor() {
        this.frames = [];
        this.width = 0;
        this.height = 0;
        this.delay = 200;
        this.onProgress = null;
        console.log('简单GIF编码器初始化');
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
        
        this.frames.push({
            data: new Uint8Array(imageData.data),
            width: canvas.width,
            height: canvas.height,
            delay: delay
        });
        
        console.log(`简单编码器添加帧 ${this.frames.length}: ${canvas.width}x${canvas.height}`);
    }

    /**
     * 生成GIF
     */
    encode() {
        if (this.frames.length === 0) {
            throw new Error('没有帧数据');
        }

        console.log(`开始简单GIF编码: ${this.width}x${this.height}, ${this.frames.length}帧`);

        const gif = [];
        
        // GIF文件头 "GIF89a"
        this.writeString(gif, 'GIF89a');
        
        // 逻辑屏幕描述符
        this.writeUint16(gif, this.width);   // 画布宽度
        this.writeUint16(gif, this.height);  // 画布高度
        
        // 全局颜色表信息 (8色 = 3位 = 大小值2)
        gif.push(0xF2);  // 11110010: 全局颜色表=1, 颜色分辨率=111, 排序=0, 大小=010 (8色)
        gif.push(0x00);  // 背景颜色索引
        gif.push(0x00);  // 像素长宽比
        
        // 全局颜色表 (8色)
        gif.push(0x00, 0x00, 0x00); // 0: 黑色
        gif.push(0x80, 0x00, 0x00); // 1: 深红
        gif.push(0x00, 0x80, 0x00); // 2: 深绿
        gif.push(0x80, 0x80, 0x00); // 3: 深黄
        gif.push(0x00, 0x00, 0x80); // 4: 深蓝
        gif.push(0x80, 0x00, 0x80); // 5: 深紫
        gif.push(0x00, 0x80, 0x80); // 6: 深青
        gif.push(0xFF, 0xFF, 0xFF); // 7: 白色
        
        // 应用程序扩展 (NETSCAPE2.0 - 用于循环)
        gif.push(0x21, 0xFF, 0x0B); // 扩展介绍符, 应用程序扩展标签, 块大小
        this.writeString(gif, 'NETSCAPE2.0');
        gif.push(0x03, 0x01, 0x00, 0x00, 0x00); // 循环次数 = 0 (无限循环)
        
        // 处理每一帧
        for (let i = 0; i < this.frames.length; i++) {
            if (this.onProgress) {
                this.onProgress(i / this.frames.length);
            }
            this.writeFrame(gif, this.frames[i]);
        }
        
        // GIF结尾
        gif.push(0x3B);
        
        if (this.onProgress) {
            this.onProgress(1.0);
        }
        
        console.log(`简单GIF编码完成: ${gif.length} 字节`);
        return new Uint8Array(gif);
    }

    /**
     * 写入帧数据
     */
    writeFrame(gif, frame) {
        // 图形控制扩展
        gif.push(0x21);    // 扩展介绍符
        gif.push(0xF9);    // 图形控制标签
        gif.push(0x04);    // 块大小
        gif.push(0x00);    // 处置方法 = 不处置
        
        // 延迟时间 (1/100秒为单位)
        const delay = Math.max(1, Math.round(frame.delay / 10));
        this.writeUint16(gif, delay);
        
        gif.push(0x00);    // 透明颜色索引
        gif.push(0x00);    // 块终止符
        
        // 图像描述符
        gif.push(0x2C);    // 图像分离符
        this.writeUint16(gif, 0);           // 左偏移
        this.writeUint16(gif, 0);           // 顶偏移
        this.writeUint16(gif, frame.width); // 图像宽度
        this.writeUint16(gif, frame.height);// 图像高度
        gif.push(0x00);    // 局部颜色表标志 = 0 (使用全局颜色表)
        
        // 将RGBA数据转换为8色索引
        const indices = this.quantizeColors(frame.data);
        
        // 简单的无压缩LZW编码
        this.writeLZWData(gif, indices);
    }

    /**
     * 量化为256色调色板
     */
    quantizeColors(rgbaData) {
        const indices = [];
        
        for (let i = 0; i < rgbaData.length; i += 4) {
            const r = rgbaData[i];
            const g = rgbaData[i + 1];
            const b = rgbaData[i + 2];
            const a = rgbaData[i + 3];
            
            // 简单8色量化
            if (a < 128) {
                indices.push(0); // 透明/黑色
            } else {
                // 根据RGB值映射到8色调色板
                const rIndex = r > 127 ? 1 : 0;
                const gIndex = g > 127 ? 1 : 0;
                const bIndex = b > 127 ? 1 : 0;
                
                const colorIndex = (rIndex << 2) | (gIndex << 1) | bIndex;
                indices.push(colorIndex);
            }
        }
        
        return indices;
    }

    /**
     * 写入LZW压缩数据 (简化版本)
     */
    writeLZWData(gif, indices) {
        // LZW最小代码大小
        const minCodeSize = 3; // 8色需要3位
        gif.push(minCodeSize);
        
        // 清除码和结束码
        const clearCode = 8;  // 2^3
        const endCode = 9;
        
        let bitBuffer = 0;
        let bitCount = 0;
        const compressed = [];
        
        // 写入位数据
        const writeBits = (code, codeSize) => {
            bitBuffer |= (code << bitCount);
            bitCount += codeSize;
            
            while (bitCount >= 8) {
                compressed.push(bitBuffer & 0xFF);
                bitBuffer >>= 8;
                bitCount -= 8;
            }
        };
        
        let codeSize = 4; // 开始用4位编码 (3+1)
        
        // 写入清除码
        writeBits(clearCode, codeSize);
        
        // 写入所有像素数据
        for (const index of indices) {
            writeBits(index, codeSize);
        }
        
        // 写入结束码
        writeBits(endCode, codeSize);
        
        // 写入剩余位
        if (bitCount > 0) {
            compressed.push(bitBuffer & 0xFF);
        }
        
        // 按GIF规范分块写入
        let pos = 0;
        while (pos < compressed.length) {
            const blockSize = Math.min(255, compressed.length - pos);
            gif.push(blockSize);
            
            for (let i = 0; i < blockSize; i++) {
                gif.push(compressed[pos + i]);
            }
            pos += blockSize;
        }
        
        // 数据终止符
        gif.push(0x00);
    }

    /**
     * 写入字符串
     */
    writeString(buffer, str) {
        for (let i = 0; i < str.length; i++) {
            buffer.push(str.charCodeAt(i));
        }
    }

    /**
     * 写入16位整数 (小端字节序)
     */
    writeUint16(buffer, value) {
        buffer.push(value & 0xFF);
        buffer.push((value >> 8) & 0xFF);
    }

    /**
     * 创建Blob
     */
    createBlob() {
        const data = this.encode();
        return new Blob([data], { type: 'image/gif' });
    }
}

// 导出
if (typeof window !== 'undefined') {
    window.SimpleGifEncoder = SimpleGifEncoder;
}