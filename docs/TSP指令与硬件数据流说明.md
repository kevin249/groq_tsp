# TSP 指令与硬件数据流说明

本页面向芯片研发工程师，解释三维工作台中新增加的系统级数据流与 TSP 指令教学层。

## 整机到芯片的数据流

页面按当前执行步骤在三维硬件上显示连续路径和移动的数据标记：

- 外部 / 服务器：Host / GPU → ConnectX-9 → Spectrum-X → LPX 入口。
- 机架 / 托盘：NIC → Fabric → LPU。
- LPU die：MEM → MXM / VXM / SXM / C2C → MEM。
- 播放时，数据标记在当前 semantic event 内按视觉进度连续插值；暂停后位置冻结，拖动动作时间轴可重放相同位置。

这些动画表达的是数据依赖和资源方向，不表示真实包延迟、链路协议时序或硬件 cycle。

## TSP 指令教学层

“05 · TSP 指令流”只使用公开 TSP / Tensor Streaming 资料中出现的指令类别和 opcode，用来解释 instruction stream 如何驱动 data stream：

- ICU：NOP、Ifetch、Sync、Notify、Config、Repeat。
- MEM：Read、Write、Gather、Scatter，以及地址生成相关 Countdown / Step / Iterations。
- MXM：LW、IW、ABC、ACC。
- VXM：unary / binary operation、type conversion，以及公开的 ReLU / TanH / Exp / RSqrt 类操作。
- SXM：Shift、Permute、Distribute、Rotate、Transpose。
- C2C：Deskew、Send、Receive。

矩阵教学流程示意为：

`ICU Ifetch → MEM Read W → MXM LW → MXM IW → MEM Read X → MXM ABC → MXM ACC → MEM Write Y`

指令标记从 ICU 向当前功能 slice 连续移动，用来表现 TSP 中 instruction flow 与 data flow 的交互。

## 边界

这里不是 Groq 3 私有 ISA，也不是 Groq compiler 的真实 trace。以下内容保持未知，不在页面中伪造：

- 真实 instruction address / binary encoding。
- 真实 stream ID、MEM address 和 bank 映射。
- NOP / Repeat 的实际数量。
- 每条指令 latency、issue cycle 和 pipeline depth。
- Groq 3 编译器对 Qwen 的真实静态排程。

页面里的 `aX / aW / aY / sX / sW / sY` 都是教学符号，只用于说明“地址、stream、功能 slice”之间的关系。
