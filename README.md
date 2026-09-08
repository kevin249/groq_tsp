# Groq LPX 三维可视化解析

以“谁是世界上最厉害的大模型？”为入口，观察真实 Token、模型网络、GPU / LPX 分工，以及机架、服务器、芯片中的数据与控制操作。

直接打开 [Groq_TSP_交互讲解.html](Groq_TSP_交互讲解.html)。默认是参考 Blender 分区方式的亮色工作台：顶部工作区、左侧执行树、中央三维视口、右侧属性与性能、底部时间轴。Three.js 渲染实体部件，菜单仍是同一场景中的 CSS3DObject，通过相机朝向补偿保持可读。运行所需的脚本、材质生成代码、几何、样式、Token 快照和 Mermaid 网络图均已内嵌。

默认“完整请求”只接收一次 Prompt，经过 GPU Prefill 后进入 GPU → Groq LPX FFN / MoE → GPU → 用户的 Decode 路径。传输是有限的一次飞行，到达后驻留；结束后停止，需要明确重置才会重新输入。“下一 Token”保留上下文，直接进入 Decode，不重复原句的接收、分词与 Prefill。单独选择 Prefill 时，查看的是全部在 GPU 执行的前缀处理。

## Prompt 与真实分词

分别调用两个模型的官方 tokenizer，并执行官方 Jinja 对话模板。当前句子的正文均为以下 6 个 Token：

| 字片 | Token ID |
| --- | ---: |
| 谁是 | 121232 |
| 世界上最 | 114314 |
| 厉害 | 102169 |
| 的大 | 97796 |
| 模型 | 103725 |
| ？ | 10992 |

单条 user 消息、关闭 thinking、添加 assistant 生成前缀时，完整输入为 18 个 Token。底部点击字片可追踪对应 ID 与激活；“正文 6 / 输入 18”展开全部模板标记。续写句“没有单一答案，要看任务和评测。”是给定回放，不是本页执行权重生成的答案。

## 空间与操作

| 位置 | 内容与操作 |
| --- | --- |
| 左侧悬浮菜单 | 模型、Prefill / Decode、任意模型层、完整分组流程、同时显示的指令与数据 |
| 中央实体 | 外部服务 / GPU、32 槽 LPX 机架、单托盘 8 LPU、片间互联、芯片内部 14 个公开区域 |
| 右侧悬浮菜单 | 当前算子、张量形状、矩阵 FLOPs、权重 / 激活字节、资源下界、专家和精度选择 |
| 底部悬浮菜单 | 真实字片与 ID、播放 / 暂停、前后操作、速度、给定续写的下一位置 |

拖动旋转、滚轮缩放，点击硬件检查部件，双击槽位或 LPU 深入。“展开”连续抽出托盘或移开服务器上盖、冷板。“跟随”让镜头跟随所选算子的执行位置。底部时间轴可选择算子、拖动当前动作进度；“动作回放”的秒数是视觉时间，不是芯片 latency。网络总览使用 Mermaid，机械实体采用金属、PCB、鳍片、连接器和小元件网格。

Rubin GPU 根据 [NVIDIA 官方结构](https://developer.nvidia.com/blog/inside-the-nvidia-rubin-platform-six-new-chips-one-ai-supercomputer/)及[封装对照图](https://developer-blogs.nvidia.com/wp-content/uploads/2026/03/LPX05-Rubin_GPU_and_Groq_3_LPU.webp)重建为双计算裸片、八组 HBM4，替代通用板卡外形。权重 / KV / 状态映射到 HBM 与存储层级，矩阵乘映射到 SM 内 Tensor Core，向量与 Softmax 映射到相应执行资源。图中位置表示资源归属，具体 SM、HBM 栈和存储地址分配未公开，不伪造实机调度。

## 两模型的独立网络

- Qwen3.8-27B：64 层、D=5120；48 层 DeltaNet、16 层 Gated Attention；24Q / 4KV、Dense SwiGLU 中间维 17408、普通残差与最终 RMSNorm。
- Qwen3.8-Flash-Next：48 层、D=2560；四路门控残差，第 2 层 PLE n-gram 注入；36 层 DeltaNet、12 层 QSA；512 个路由专家选 10 个，加独立共享专家，最后为门控残差混合。

依据 NVIDIA 的 AFD 方案，Prefill 在 GPU 完成所有层；Decode 的 Attention、缓存与残差留在 GPU，FFN / MoE 的隐藏激活送入 LPX，再返回 GPU。进入 LPX 的是向量，不是原始文本。网络的具体分支见 [27B Mermaid 源图](hardware/network27.mmd) 与 [Flash-Next Mermaid 源图](hardware/networkflash.mmd)。

模型与部署是两个层次：27B 的 TP2、Flash-Next 的 EP8 / EP16 是解释数据去向的示例分配；专家编号不是本句推理得到的实际 Top-10。物理外形参照公开图，未公开的制造尺寸、板内实际布线与 GPU 内部分区不视为已知。LPX 的单条指令周期未公开，界面不将动画帧或播放秒数冒充硬件 cycle。

## 源码与构建

| 文件 | 用途 |
| --- | --- |
| index.html / Groq_TSP_交互讲解.html | 开发入口 / 可独立分发的网页 |
| spatial-lab-source.mjs / spatial-hardware.mjs / rubin-hardware.mjs | 场景、相机、空间菜单、数据层 / 机架与服务器 / Rubin 封装 |
| spatial-lab.js / spatial-lab.css | 内嵌 Three.js 的浏览器包 / 空间界面样式 |
| token-samples.js / network-model.js | 官方分词及模板快照 / 两模型的操作、形状与成本 |
| lpx-model.js / hardware/ | LPX 规格与示例分配 / Mermaid 源图和 SVG |
| [解析方案](docs/解析方案.md)、[设计说明](docs/设计说明.md)、[验证说明](docs/验证说明.md) | 方案、口径和验证范围 |

仓库保留第一代 TSP 的独立周期模型、手算例子及原有解析视图源码；它们不充当 Groq 3 的实机 trace。

在仓库根目录运行，所有文件均为 UTF-8：

| 操作 | 命令 |
| --- | --- |
| 安装锁定的开发依赖 | npm.cmd --prefix tools ci |
| 更新独立 HTML（含三维包） | npm.cmd --prefix tools run pack |
| 重新生成 Mermaid 与三维包 | npm.cmd --prefix tools run build |
| 从官方网址更新分词快照 | npm.cmd --prefix tools run build:tokens |
| 核心与引用检查 | npm.cmd --prefix tools run check |
| 网络 / Token 与真实 WebGL 浏览器检查 | npm.cmd --prefix tools run check:immersive |

构建需要 tools 中的依赖；打开成品 HTML 不需要安装工具。浏览器检查默认使用 Windows Edge，可用 SPATIAL_BROWSER 指定 Chromium 程序。测试报告和截图写入已忽略的 reports、预览目录。Three.js 的 MIT 许可原文随浏览器包保留。

## 公开参考资料

资料引用仅使用下表中的公开网上入口。仓库内部的源码、Mermaid 资产及说明文档属于项目组成部分；独立 HTML 已内嵌运行所需的脚本、样式与图形。

| 资料 | 网上入口与用途 |
| --- | --- |
| NVIDIA · Groq 3 LPX | [官方文章](https://developer.nvidia.com/blog/inside-nvidia-groq-3-lpx-the-low-latency-inference-accelerator-for-the-nvidia-vera-rubin-platform/)：机架、托盘、芯片结构、AFD 及公开带宽 |
| Qwen3.8-27B | [官方模型配置](https://huggingface.co/Qwen/Qwen3.8-27B/blob/main/config.json)：层数、隐藏维、FFN 与混合 Attention 结构 |
| Qwen3.8-Flash-Next | [官方模型配置](https://huggingface.co/Qwen/Qwen3.8-Flash-Next/blob/main/config.json)、[模型卡](https://huggingface.co/Qwen/Qwen3.8-Flash-Next)：MoE、QSA、专家数量与参数组成 |
| ISCA 2020 · Think Fast | [作者公开 PDF](http://pkamath.com/publications/papers/tsp-isca20.pdf)、[出版 DOI](https://doi.org/10.1109/ISCA45697.2020.00023)：功能切片、流寄存器、ICU、PCIe / DMA |
| ISCA 2022 · Software-defined TSM | [出版 DOI](https://doi.org/10.1145/3470496.3527405)：多芯片互连与软件调度 |
| ASAP 2022 · Answer Fast | [作者预印本](https://arxiv.org/abs/2206.11062)：Attention、FFN 与主机通信 |
| Hot Chips 34 · Scale-out TSP | [会议官网讲稿](https://hc34.hotchips.org/assets/program/conference/day2/Machine%20Learning/HotChips34%20-%20Groq%20-%20Abts%20-%20final.pdf)：片间同步、Deskew、模型并行与归约 |
| GroqChip · Product Brief v1.5 | [Groq 产品原文的公开镜像](https://manuals.plus/m/3c668117454870c4f21fdd1d653ac2168bf523a305b16db5c9a800ca5a0186a1.pdf)：188 TFLOP/s、80 TB/s、SRAM 与 PCIe |
| GroqCard · Product Brief v1.5 | [BittWare 收录的 Groq 产品原文](https://www.bittware.com/files/GroqCard%E2%84%A2-Accelerator-Product-Brief-v1.5-.pdf)：板卡和 PCIe Gen4 x16 接口 |
| MLSys 2026 · SHIP | [会议摘要](https://proceedings.mlsys.org/paper_files/paper/2026/hash/9c20f16b05f5e5e70fa07e2a4364b80e-Abstract-Conference.html)、[会议论文](https://proceedings.mlsys.org/paper_files/paper/2026/file/9c20f16b05f5e5e70fa07e2a4364b80e-Paper-Conference.pdf)：LLM 服务、KV、Prefill 与 Decode |
| Groq 官方文本生成文档 | [Text Generation](https://console.groq.com/docs/text-chat)：请求字段、流式响应与结束条件 |

GroqCard 引用统一采用网上可直接获取的 v1.5 原文，版本名称同步更新；本页使用的 PCIe Gen4 x16 接口口径不变。产品镜像是 Groq 编写的原始规格书，并非镜像网站的二次解读。

2026-09-08 已直接访问核对作者 PDF、会议资料、预印本、产品 PDF 与官方文档。两个 DOI 均能解析到出版方；出版站点对自动访问返回验证页面或空响应，因此不将 DOI 落地页记为全文访问通过。常规引用检查不联网，避免将网络状态与动画功能检查混在一起。
