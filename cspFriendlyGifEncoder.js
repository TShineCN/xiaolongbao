/**
 * CSP友好的GIF编码器
 * 纯JavaScript实现，不使用eval()或其他被CSP限制的功能
 */
class CSPFriendlyGifEncoder {
    constructor() {
        this.frames = [];
        this.delay = 200;
        this.width = 0;
        this.height = 0;
        this.onProgress = null;
        console.log('CSP友好的GIF编码器初始化');
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
     * 生成GIF数据
     * @returns {Uint8Array} GIF数据
     */
    encode() {
        if (this.frames.length === 0) {
            throw new Error('没有帧数据');
        }

        console.log(`开始编码GIF: ${this.width}x${this.height}, ${this.frames.length}帧`);

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
     * 写入全局颜色表 (简化的256色调色板)
     */
    writeGlobalColorTable(buffer) {
        // 创建一个简化的256色调色板
        for (let i = 0; i < 256; i++) {
            // 使用简单的RGB映射
            const r = (i & 0xE0) | ((i & 0xE0) >> 3) | ((i & 0xC0) >> 6);
            const g = ((i & 0x1C) << 3) | (i & 0x1C) | ((i & 0x18) >> 2);
            const b = ((i & 0x03) << 6) | ((i & 0x03) << 4) | ((i & 0x03) << 2) | (i & 0x03);
            
            buffer.push(r, g, b);
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
        const delay = Math.round(frame.delay / 10);
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
     * 将RGBA数据转换为调色板索引
     */
    rgbaToColorIndex(r, g, b) {
        // 简化的颜色量化
        const rIndex = Math.floor(r / 32) * 32;
        const gIndex = Math.floor(g / 32) * 32;
        const bIndex = Math.floor(b / 64) * 64;
        
        // 映射到0-255索引
        return Math.floor((rIndex / 32) * 36 + (gIndex / 32) * 6 + (bIndex / 64));
    }

    /**
     * LZW压缩图像数据 (简化版本)
     */
    compressImageData(indices) {
        // 非常简化的LZW压缩
        const compressed = [];
        const codeSize = 8; // 初始代码大小
        
        // LZW压缩的简化实现
        compressed.push(codeSize); // 最小代码大小
        
        // 清除代码
        const clearCode = 1 << codeSize;
        const endCode = clearCode + 1;
        
        // 简化处理：直接输出索引
        const packedData = [];
        packedData.push(clearCode & 0xFF, (clearCode >> 8) & 0xFF);
        
        for (let i = 0; i < indices.length; i++) {
            packedData.push(indices[i]);
        }
        
        packedData.push(endCode & 0xFF, (endCode >> 8) & 0xFF);
        
        // 分块输出
        let offset = 0;
        while (offset < packedData.length) {
            const chunkSize = Math.min(255, packedData.length - offset);
            compressed.push(chunkSize);
            for (let i = 0; i < chunkSize; i++) {
                compressed.push(packedData[offset + i]);
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
        console.log(`编码帧 ${frameIndex + 1}/${this.frames.length}`);
        
        // 写入图形控制扩展
        this.writeGraphicControlExtension(buffer, frame);
        
        // 写入图像描述符
        this.writeImageDescriptor(buffer, frame);
        
        // 转换RGBA数据为调色板索引
        const indices = [];
        for (let i = 0; i < frame.data.length; i += 4) {
            const r = frame.data[i];
            const g = frame.data[i + 1];
            const b = frame.data[i + 2];
            // const a = frame.data[i + 3]; // 忽略alpha通道
            
            const colorIndex = this.rgbaToColorIndex(r, g, b);
            indices.push(Math.min(255, Math.max(0, colorIndex)));
        }
        
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