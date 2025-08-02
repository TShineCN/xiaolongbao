/**
 * 现代CSP友好GIF编码器
 * 使用标准化的GIF格式和优化的编码算法
 */
class ModernGifEncoder {
    constructor() {
        this.frames = [];
        this.width = 0;
        this.height = 0;
        this.delay = 200;
        this.onProgress = null;
        console.log('现代GIF编码器初始化');
    }

    /**
     * 添加帧
     */
    addFrame(canvas, options = {}) {
        const delay = options.delay || this.delay;
        
        // 设置尺寸
        if (this.width === 0) {
            this.width = canvas.width;
            this.height = canvas.height;
        }
        
        // 获取图像数据
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        this.frames.push({
            data: new Uint8Array(imageData.data),
            width: canvas.width,
            height: canvas.height,
            delay: delay
        });
        
        console.log(`添加帧 ${this.frames.length}: ${canvas.width}x${canvas.height}`);
    }

    /**
     * 生成GIF数据
     */
    encode() {
        if (this.frames.length === 0) {
            throw new Error('没有帧数据');
        }

        console.log(`开始编码GIF: ${this.width}x${this.height}, ${this.frames.length}帧`);

        const buffer = [];
        
        // 写入GIF头部
        this.writeString(buffer, 'GIF89a');
        
        // 写入逻辑屏幕描述符
        this.writeUint16(buffer, this.width);
        this.writeUint16(buffer, this.height);
        
        // 全局颜色表标志 | 颜色分辨率 | 排序标志 | 全局颜色表大小
        buffer.push(0x87); // 10000111 - 有全局颜色表，8位颜色，8色
        buffer.push(0x00); // 背景颜色索引
        buffer.push(0x00); // 像素长宽比
        
        // 写入简化的8色调色板
        const palette = [
            [0, 0, 0],       // 黑色
            [255, 255, 255], // 白色
            [255, 0, 0],     // 红色
            [0, 255, 0],     // 绿色
            [0, 0, 255],     // 蓝色
            [255, 255, 0],   // 黄色
            [255, 0, 255],   // 洋红
            [0, 255, 255]    // 青色
        ];
        
        for (const color of palette) {
            buffer.push(color[0], color[1], color[2]);
        }
        
        // 写入应用程序扩展（循环）
        this.writeString(buffer, '\x21\xFF\x0BNETSCAPE2.0\x03\x01\x00\x00\x00');
        
        // 写入每一帧
        for (let i = 0; i < this.frames.length; i++) {
            if (this.onProgress) {
                this.onProgress(i / this.frames.length);
            }
            this.writeFrame(buffer, this.frames[i]);
        }
        
        // GIF结尾
        buffer.push(0x3B);
        
        if (this.onProgress) {
            this.onProgress(1.0);
        }
        
        console.log(`GIF编码完成，大小: ${buffer.length} 字节`);
        return new Uint8Array(buffer);
    }

    /**
     * 写入帧数据
     */
    writeFrame(buffer, frame) {
        // 图形控制扩展
        buffer.push(0x21); // 扩展介绍符
        buffer.push(0xF9); // 图形控制标签
        buffer.push(0x04); // 数据长度
        buffer.push(0x00); // 处置方法
        
        // 延迟时间（1/100秒）
        const delay = Math.max(1, Math.round(frame.delay / 10));
        this.writeUint16(buffer, delay);
        
        buffer.push(0x00); // 透明颜色索引
        buffer.push(0x00); // 块终止符
        
        // 图像描述符
        buffer.push(0x2C); // 图像分离符
        this.writeUint16(buffer, 0); // 左偏移
        this.writeUint16(buffer, 0); // 顶偏移
        this.writeUint16(buffer, frame.width);
        this.writeUint16(buffer, frame.height);
        buffer.push(0x00); // 无局部颜色表
        
        // 转换图像数据为索引
        const indices = this.convertToIndices(frame.data);
        
        // 使用简化的无压缩方法
        buffer.push(0x02); // LZW最小代码大小为2（因为我们只用8色）
        
        // 直接写入像素数据（简化版）
        this.writeUncompressedData(buffer, indices);
        
        buffer.push(0x00); // 数据终止符
    }

    /**
     * 转换RGBA数据为调色板索引
     */
    convertToIndices(data) {
        const indices = [];
        
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];
            
            if (a < 128) {
                indices.push(0); // 透明 -> 黑色
                continue;
            }
            
            // 简单的颜色量化到8色
            let index = 0;
            if (r > 127 && g > 127 && b > 127) index = 1; // 白色
            else if (r > 127 && g < 128 && b < 128) index = 2; // 红色
            else if (r < 128 && g > 127 && b < 128) index = 3; // 绿色
            else if (r < 128 && g < 128 && b > 127) index = 4; // 蓝色
            else if (r > 127 && g > 127 && b < 128) index = 5; // 黄色
            else if (r > 127 && g < 128 && b > 127) index = 6; // 洋红
            else if (r < 128 && g > 127 && b > 127) index = 7; // 青色
            else index = 0; // 默认黑色
            
            indices.push(index);
        }
        
        return indices;
    }

    /**
     * 写入未压缩的数据
     */
    writeUncompressedData(buffer, indices) {
        // 使用最简单的LZW编码
        const clearCode = 4;  // 2^2 = 4
        const endCode = 5;
        let nextCode = 6;
        
        let bitBuffer = 0;
        let bitCount = 0;
        const outputBuffer = [];
        
        const writeBits = (code, codeSize) => {
            bitBuffer |= (code << bitCount);
            bitCount += codeSize;
            
            while (bitCount >= 8) {
                outputBuffer.push(bitBuffer & 0xFF);
                bitBuffer >>= 8;
                bitCount -= 8;
            }
        };
        
        let codeSize = 3; // 从3位开始
        
        // 写入清除代码
        writeBits(clearCode, codeSize);
        
        // 写入所有像素
        for (const index of indices) {
            writeBits(index, codeSize);
        }
        
        // 写入结束代码
        writeBits(endCode, codeSize);
        
        // 刷新剩余位
        if (bitCount > 0) {
            outputBuffer.push(bitBuffer & 0xFF);
        }
        
        // 分块写入
        let pos = 0;
        while (pos < outputBuffer.length) {
            const blockSize = Math.min(255, outputBuffer.length - pos);
            buffer.push(blockSize);
            
            for (let i = 0; i < blockSize; i++) {
                buffer.push(outputBuffer[pos + i]);
            }
            pos += blockSize;
        }
    }

    /**
     * 辅助方法：写入字符串
     */
    writeString(buffer, str) {
        for (let i = 0; i < str.length; i++) {
            buffer.push(str.charCodeAt(i));
        }
    }

    /**
     * 辅助方法：写入16位整数（小端）
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
    window.ModernGifEncoder = ModernGifEncoder;
}