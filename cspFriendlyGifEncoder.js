/**
 * CSP友好的GIF编码器 - 完全重写版本
 * 纯JavaScript实现，不使用eval()或其他被CSP限制的功能
 * 使用简化但正确的GIF格式
 */
class CSPFriendlyGifEncoder {
    constructor() {
        this.frames = [];
        this.delay = 200;
        this.width = 0;
        this.height = 0;
        this.onProgress = null;
        this.globalPalette = null;
        console.log('CSP友好的GIF编码器初始化（重写版）');
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
     * 生成标准216色web安全调色板
     */
    generatePalette() {
        const palette = [];
        
        // 216色web安全调色板 (6x6x6)
        for (let r = 0; r < 6; r++) {
            for (let g = 0; g < 6; g++) {
                for (let b = 0; b < 6; b++) {
                    palette.push([
                        Math.floor(r * 51), // 0, 51, 102, 153, 204, 255
                        Math.floor(g * 51),
                        Math.floor(b * 51)
                    ]);
                }
            }
        }
        
        // 添加40种灰度
        for (let i = 0; i < 40; i++) {
            const gray = Math.floor(i * 255 / 39);
            palette.push([gray, gray, gray]);
        }
        
        // 确保调色板有256种颜色
        while (palette.length < 256) {
            palette.push([0, 0, 0]);
        }
        
        this.globalPalette = palette;
        console.log(`生成标准调色板: ${palette.length} 种颜色`);
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
     * 将RGB颜色映射到调色板索引（改进版）
     */
    mapColorToPalette(r, g, b) {
        if (!this.globalPalette) {
            this.generatePalette();
        }
        
        let bestIndex = 0;
        let bestDistance = Infinity;
        
        // 对于web安全色，直接查找最接近的值
        const safeR = Math.round(r / 51) * 51;
        const safeG = Math.round(g / 51) * 51;
        const safeB = Math.round(b / 51) * 51;
        
        // 先尝试精确匹配web安全色
        for (let i = 0; i < 216; i++) {
            const palette = this.globalPalette[i];
            if (palette[0] === safeR && palette[1] === safeG && palette[2] === safeB) {
                return i;
            }
        }
        
        // 如果没有精确匹配，找最接近的颜色
        for (let i = 0; i < this.globalPalette.length; i++) {
            const palette = this.globalPalette[i];
            const distance = this.colorDistance([r, g, b], palette);
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
     * 简化但正确的图像数据压缩
     */
    compressImageData(indices) {
        const compressed = [];
        
        // LZW最小代码大小
        const minCodeSize = 8;
        compressed.push(minCodeSize);
        
        // 计算清除码和结束码
        const clearCode = 1 << minCodeSize; // 256
        const endCode = clearCode + 1;       // 257
        
        let bitBuffer = 0;
        let bitCount = 0;
        const outputBuffer = [];
        
        // 写入位到缓冲区
        function writeBits(code, codeSize) {
            bitBuffer |= (code << bitCount);
            bitCount += codeSize;
            
            while (bitCount >= 8) {
                outputBuffer.push(bitBuffer & 0xFF);
                bitBuffer >>= 8;
                bitCount -= 8;
            }
        }
        
        // 当前代码大小从9位开始
        let currentCodeSize = 9;
        
        // 写入清除码
        writeBits(clearCode, currentCodeSize);
        
        // 逐个写入像素数据
        for (let i = 0; i < indices.length; i++) {
            const pixelIndex = indices[i] & 0xFF;
            writeBits(pixelIndex, currentCodeSize);
        }
        
        // 写入结束码
        writeBits(endCode, currentCodeSize);
        
        // 刷新剩余位
        if (bitCount > 0) {
            outputBuffer.push(bitBuffer & 0xFF);
        }
        
        // 按照GIF规范分块输出
        let pos = 0;
        while (pos < outputBuffer.length) {
            const blockSize = Math.min(255, outputBuffer.length - pos);
            compressed.push(blockSize);
            
            for (let i = 0; i < blockSize; i++) {
                compressed.push(outputBuffer[pos + i]);
            }
            pos += blockSize;
        }
        
        // 数据终止符
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
        let colorStats = {};
        
        for (let i = 0; i < frame.data.length; i += 4) {
            const r = frame.data[i];
            const g = frame.data[i + 1];
            const b = frame.data[i + 2];
            const a = frame.data[i + 3];
            
            let colorIndex;
            if (a < 128) {
                // 透明像素用黑色
                colorIndex = 0;
            } else {
                colorIndex = this.mapColorToPalette(r, g, b);
                
                // 统计颜色使用情况
                const colorKey = `${r},${g},${b}`;
                colorStats[colorKey] = (colorStats[colorKey] || 0) + 1;
            }
            
            indices.push(colorIndex);
        }
        
        const uniqueColors = Object.keys(colorStats).length;
        console.log(`帧 ${frameIndex + 1}: ${indices.length} 像素, ${uniqueColors} 种颜色`);
        
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