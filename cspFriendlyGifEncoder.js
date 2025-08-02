/**
 * CSP友好的GIF编码器 - 修复版本
 * 纯JavaScript实现，不使用eval()或其他被CSP限制的功能
 * 修复颜色处理和LZW压缩问题
 */
class CSPFriendlyGifEncoder {
    constructor() {
        this.frames = [];
        this.delay = 200;
        this.width = 0;
        this.height = 0;
        this.onProgress = null;
        this.globalPalette = null;
        console.log('CSP友好的GIF编码器初始化（修复版）');
    }

    /**
     * 添加帧
     * @param {Canvas} canvas 
     * @param {Object} options 
     */
    addFrame(canvas, options = {}) {
        const delay = options.delay || this.delay;
        
        // 获取canvas数据
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        this.frames.push({
            data: imageData.data,
            width: canvas.width,
            height: canvas.height,
            delay: delay
        });
        
        // 设置GIF尺寸
        if (this.width === 0) {
            this.width = canvas.width;
            this.height = canvas.height;
        }
        
        console.log(`添加帧 ${this.frames.length}: ${canvas.width}x${canvas.height}, 延迟: ${delay}ms`);
    }

    /**
     * 生成更丰富的调色板
     */
    generatePalette() {
        const palette = [];
        
        // 生成8级RGB色彩空间 (8x8x4 = 256)
        for (let r = 0; r < 8; r++) {
            for (let g = 0; g < 8; g++) {
                for (let b = 0; b < 4; b++) {
                    palette.push([
                        Math.floor(r * 255 / 7),
                        Math.floor(g * 255 / 7),
                        Math.floor(b * 255 / 3)
                    ]);
                }
            }
        }
        
        // 确保调色板有256种颜色
        while (palette.length < 256) {
            palette.push([0, 0, 0]);
        }
        
        this.globalPalette = palette;
        console.log(`生成调色板: ${palette.length} 种颜色`);
        return palette;
    }

    /**
     * 计算颜色距离
     */
    colorDistance(c1, c2) {
        const dr = c1[0] - c2[0];
        const dg = c1[1] - c2[1];
        const db = c1[2] - c2[2];
        return dr * dr + dg * dg + db * db;
    }

    /**
     * 将RGB颜色映射到调色板索引
     */
    mapColorToPalette(r, g, b) {
        if (!this.globalPalette) {
            this.generatePalette();
        }
        
        let bestIndex = 0;
        let bestDistance = Infinity;
        
        for (let i = 0; i < this.globalPalette.length; i++) {
            const distance = this.colorDistance([r, g, b], this.globalPalette[i]);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = i;
            }
        }
        
        return bestIndex;
    }

    /**
     * 生成GIF数据
     * @returns {Uint8Array} GIF数据
     */
    encode() {
        if (this.frames.length === 0) {
            throw new Error('没有帧数据');
        }

        console.log(`开始编码GIF: ${this.width}x${this.height}, ${this.frames.length}帧`);

        // 生成调色板
        this.generatePalette();

        // GIF数据缓冲区
        const buffer = [];
        
        // 写入GIF头部
        this.writeHeader(buffer);
        
        // 写入逻辑屏幕描述符
        this.writeLogicalScreenDescriptor(buffer);
        
        // 写入全局颜色表
        this.writeGlobalColorTable(buffer);
        
        // 写入应用程序扩展（循环）
        this.writeApplicationExtension(buffer);
        
        // 写入每一帧
        for (let i = 0; i < this.frames.length; i++) {
            if (this.onProgress) {
                this.onProgress(i / this.frames.length);
            }
            this.writeFrame(buffer, this.frames[i], i);
        }
        
        // 写入GIF结尾
        buffer.push(0x3B);
        
        if (this.onProgress) {
            this.onProgress(1.0);
        }
        
        console.log(`GIF编码完成，总大小: ${buffer.length} 字节`);
        return new Uint8Array(buffer);
    }

    /**
     * 写入GIF头部
     */
    writeHeader(buffer) {
        // GIF89a
        buffer.push(...[0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    }

    /**
     * 写入逻辑屏幕描述符
     */
    writeLogicalScreenDescriptor(buffer) {
        // 宽度 (小端)
        buffer.push(this.width & 0xFF, (this.width >> 8) & 0xFF);
        // 高度 (小端)
        buffer.push(this.height & 0xFF, (this.height >> 8) & 0xFF);
        
        // 全局颜色表标志 | 颜色分辨率 | 排序标志 | 全局颜色表大小
        buffer.push(0xF7); // 11110111 = 全局颜色表存在，8位颜色，256色
        
        // 背景颜色索引
        buffer.push(0x00);
        
        // 像素长宽比
        buffer.push(0x00);
    }

    /**
     * 写入全局颜色表
     */
    writeGlobalColorTable(buffer) {
        for (let i = 0; i < 256; i++) {
            const color = this.globalPalette[i] || [0, 0, 0];
            buffer.push(color[0], color[1], color[2]);
        }
    }

    /**
     * 写入应用程序扩展（用于循环）
     */
    writeApplicationExtension(buffer) {
        // 扩展介绍符
        buffer.push(0x21);
        // 应用程序扩展标签
        buffer.push(0xFF);
        // 数据子块大小
        buffer.push(0x0B);
        // 应用程序标识符 "NETSCAPE"
        buffer.push(...[0x4E, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45]);
        // 应用程序验证码 "2.0"
        buffer.push(...[0x32, 0x2E, 0x30]);
        // 数据子块大小
        buffer.push(0x03);
        // 子块ID
        buffer.push(0x01);
        // 循环次数 (0 = 无限循环)
        buffer.push(0x00, 0x00);
        // 块终止符
        buffer.push(0x00);
    }

    /**
     * 写入图形控制扩展
     */
    writeGraphicControlExtension(buffer, frame) {
        // 扩展介绍符
        buffer.push(0x21);
        // 图形控制标签
        buffer.push(0xF9);
        // 数据子块大小
        buffer.push(0x04);
        // 处置方法 | 用户输入标志 | 透明颜色标志
        buffer.push(0x04); // 不处置
        // 延迟时间 (单位: 1/100秒)
        const delay = Math.max(1, Math.round(frame.delay / 10));
        buffer.push(delay & 0xFF, (delay >> 8) & 0xFF);
        // 透明颜色索引
        buffer.push(0x00);
        // 块终止符
        buffer.push(0x00);
    }

    /**
     * 写入图像描述符
     */
    writeImageDescriptor(buffer, frame) {
        // 图像分离符
        buffer.push(0x2C);
        // 左边偏移 (小端)
        buffer.push(0x00, 0x00);
        // 顶部偏移 (小端)
        buffer.push(0x00, 0x00);
        // 图像宽度 (小端)
        buffer.push(frame.width & 0xFF, (frame.width >> 8) & 0xFF);
        // 图像高度 (小端)
        buffer.push(frame.height & 0xFF, (frame.height >> 8) & 0xFF);
        // 局部颜色表标志 | 交错标志 | 排序标志 | 保留 | 局部颜色表大小
        buffer.push(0x00); // 无局部颜色表
    }

    /**
     * 改进的LZW压缩
     */
    compressImageData(indices) {
        const compressed = [];
        const codeSize = 8; // 初始代码大小
        
        // LZW初始代码大小
        compressed.push(codeSize);
        
        // 清除代码和结束代码
        const clearCode = 1 << codeSize;
        const endCode = clearCode + 1;
        
        let bitBuffer = 0;
        let bitCount = 0;
        const outputBuffer = [];
        
        // 写入一个值到位缓冲区
        function writeBits(value, bits) {
            bitBuffer |= (value << bitCount);
            bitCount += bits;
            
            while (bitCount >= 8) {
                outputBuffer.push(bitBuffer & 0xFF);
                bitBuffer >>= 8;
                bitCount -= 8;
            }
        }
        
        // 初始化
        let currentCodeSize = 9;
        writeBits(clearCode, currentCodeSize);
        
        // 简化的LZW编码
        for (let i = 0; i < indices.length; i++) {
            const pixelValue = indices[i] & 0xFF; // 确保在0-255范围内
            writeBits(pixelValue, currentCodeSize);
        }
        
        // 写入结束代码
        writeBits(endCode, currentCodeSize);
        
        // 输出剩余位
        if (bitCount > 0) {
            outputBuffer.push(bitBuffer & 0xFF);
        }
        
        // 分块输出
        let offset = 0;
        while (offset < outputBuffer.length) {
            const chunkSize = Math.min(255, outputBuffer.length - offset);
            compressed.push(chunkSize);
            for (let i = 0; i < chunkSize; i++) {
                compressed.push(outputBuffer[offset + i]);
            }
            offset += chunkSize;
        }
        
        // 块终止符
        compressed.push(0x00);
        
        return compressed;
    }

    /**
     * 写入帧数据
     */
    writeFrame(buffer, frame, frameIndex) {
        console.log(`编码帧 ${frameIndex + 1}/${this.frames.length}, 尺寸: ${frame.width}x${frame.height}`);
        
        // 写入图形控制扩展
        this.writeGraphicControlExtension(buffer, frame);
        
        // 写入图像描述符
        this.writeImageDescriptor(buffer, frame);
        
        // 转换RGBA数据为调色板索引
        const indices = [];
        let nonBlackPixels = 0;
        
        for (let i = 0; i < frame.data.length; i += 4) {
            const r = frame.data[i];
            const g = frame.data[i + 1];
            const b = frame.data[i + 2];
            const a = frame.data[i + 3];
            
            // 处理透明像素
            if (a < 128) {
                indices.push(0); // 透明像素使用索引0
            } else {
                const colorIndex = this.mapColorToPalette(r, g, b);
                indices.push(colorIndex);
                if (r > 10 || g > 10 || b > 10) nonBlackPixels++;
            }
        }
        
        console.log(`帧 ${frameIndex + 1}: ${indices.length} 像素, ${nonBlackPixels} 非黑色像素`);
        
        // 压缩并写入图像数据
        const compressed = this.compressImageData(indices);
        buffer.push(...compressed);
    }

    /**
     * 创建Blob对象
     */
    createBlob() {
        const data = this.encode();
        return new Blob([data], { type: 'image/gif' });
    }
}

// 导出类
if (typeof window !== 'undefined') {
    window.CSPFriendlyGifEncoder = CSPFriendlyGifEncoder;
}