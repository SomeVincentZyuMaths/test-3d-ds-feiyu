# 蓝色大肥鱼 StarLite VRM 来源

- 3D 原模型作者：水原镜 / Mzkagami。
- 2D 形象来源：上善无形、ZipZipPipe。
- 作者配布页：https://booth.pm/en/items/8777527
- Warudo 原作者视频：https://www.bilibili.com/video/BV1WNt86bEyu/
- 原形象声明：https://www.bilibili.com/opus/1231977657712771073
- 二创来源声明：https://t.bilibili.com/1231980045693616162
- 输入：作者 Warudo ZIP，SHA-256 `05172469cd4c2976df91c91cb54e3f01d1fa9d8fb409b3cf341879a13fcd3008`。
- 输出：`BlueFish-StarLite.vrm`，10,427,496 字节，SHA-256 `896b9013642af427b475c4cd559ff9eb570a4cd543cc92e5418778560603e20b`。

许可正文为同目录 LICENSE-BlueFish.md，并逐字嵌入 VRM 的 extras.starlite.license.text。
程序 BSD 许可证不适用于本模型。原作者及形象作者署名保留；StarLite 仅作技术适配。
本目录由本地转换产生；脚本没有发布、上传或分发模型。

## 转换与验证

UnityPy 读取 UMOD/UnityFS 中的运行时资产，保留原网格、蒙皮、54 人形映射、手指及 52 项 ARKit。
Blender 5.1 / VRM Add-on 4.7.1 导出 VRM0。复原 80 表情、原视线设置、26 弹簧骨组和 12 碰撞组。
PNG 未降采样；稀疏形态与 bufferView 去重后，所有 759 个 accessor 数组均与未压缩导出逐值相等。

差异：lilToon 使用 MToon 近似；MagicaCloth 的布料与胶囊碰撞未转换。
VRM0 不支持的描边透明度分量已移除（1 处），描边 RGB 保留。
原 Warudo 的运行时脚本、直播功能和引擎专用特效不包含在 VRM 中。

复现入口依次为 extract_warudo.py、import_preview.py、build_candidates.py、pack_candidates.py、finalize_vrm.py。
源归档不修改；候选、工程和报告均保留在 release 的上一级本地目录。

## VRM0 朝向与浏览器复查

共同场景根绕 Y 轴旋转 180°，使 VRM0 资源原始正面为 -Z；运行时 rotateVRM0 后面向 +Z 默认相机。此修正未改变任何二进制网格、蒙皮、形态或贴图数据。
根代理已在真实 Hexo WebGL 预览中确认正面、全身显示与点击气泡；这是当时的代理视觉检查；后续用户已确认气泡位置，并于 2026-10-30 接受三段动作第二版。最终文件由已检查候选逐字节复制，没有重新导出。

## 作者视频声明更新

作者视频已加入许可正文、VRM 来源及 VRM0 reference。此次只更新 JSON 声明，BIN 与其余场景 JSON 保持不变。原运行验证记录保留；新文件的元数据等价校验见上级 credits-update-report.json。

## 蓝鱼动作第二版（2026-10-30 本地接受）

- `Idle`：原蓝鱼 `BluefishBasePose` 的同一静止站姿，仅统一导入名称；眨眼和视线由 StarLite 运行时负责。
- `CuriousPeek`（2.1 秒）、`SleepyStartle`（5.5 秒）：为蓝鱼制作的探头与困倦惊醒动作。
- `HappyWave`（4.5 秒）：按用户要求改编本地 `HighWave.vrma` 的上半身；其来源为 Warudo 内置 `KA_Idle16_WaveHands`，不是完全原创动作。输入 SHA-256 为 `f245b4919764433f97edd1355292900fda4fa1cd379b79faaf1e085b16045442`。未复用微光下肢、位移或表情，另作蓝鱼手臂避让与表情。
- DSH 默认点击随机使用招手／探头，偶发随机使用探头／困倦惊醒；工作等事件没有强行映射。Hexo 首次入场招手，点击与偶发使用相同动作池。

已接受候选的动画、网格、贴图、蒙皮和物理数据逐字节保留；最终封装仅统一基础动作名称并添加导入映射与验收元数据。骨骼／表情验证与浏览器播放验证位于本地 `animation-work/`。只更新本地模型，尚未发布到公共下载地址。

## 表情清理（2026-10-31）

- 保留第二版的身体动作与反弹时序。开心招手仅激活已有 MouthSmileLeft／Right 的嘴角微笑，不再激活包含半眯眼的 Joy。
- 问号与滴汗来自原模型的形态；保留原作者资源，删除 StarLite 探头／惊醒动作里的符号激活与权重轨道。
- 另导出不含角色网格、贴图、符号或自定义脸部通道的通用上半身 VRMA，困倦仅保留可选标准 blink。通用招手仍记录 Warudo 来源，不宣称完全原创。
- 本地检查通过；本工具不上传文件、不更改已公开的下载校验值。

## 默认姿态调校（2026-11-02）

用户在本地调校页选定手腕抬高 30°、转头灵敏度 2 倍，其余参数保持默认。蓝鱼的默认待机选择程序自带的 `StarLiteIdle`，保留呼吸；原模型的 `Idle` 及三段互动动作仍保留。参数存于 `extras.starlite.adjustments`；DSH 在新导入时初始化，已有用户调整不覆盖。Hexo 蓝鱼预设使用相同参数。

此次仅改变默认参数和 Idle 映射的 JSON 元数据；所有 BIN 数据、骨骼、表情、互动动作与许可保持不变。复现入口为 `tools/update_default_adjustments.mjs`，选定参数保存在 `animation-work/default-adjustments.json`。只更新本地候选，不发布、不替换已安装模型。

## StarLite 0.1.0 发行映射（2026-11-03）

本次发行使用用户已验收的元数据派生文件。网格、贴图、骨骼、形态、物理、全部 BIN 与上述已冻结模型完全一致，许可正文逐字保留。旧内嵌动作仍可手动选择；默认互动映射改用 StarLite 0.1.0 提供的 `StarLiteHappyWave`、`StarLiteCuriousPeek`、`StarLiteSleepyStartle`，待机为 `StarLiteIdle`。

程序招手采用已编辑的 `RaisedHandWave` 上半身与标准 happy 表情：原片段 3.8 秒，加 0.4 秒进入和退出，共 4.6 秒；其 Warudo 来源与校验值记录于程序包 `BUNDLED_MOTIONS.md` / `BUNDLED_MOTIONS.json`，不宣称完全原创。本模型发行物不包含原始动作库或 Blender/Unity/Warudo 工程。程序通用动作在播放时适配当前 Idle 调校，已有用户的自定义映射不被升级覆盖。

此前“本地”“尚未发布”的文字保留为制作历史；本节对应独立发行 `bluefish-v1.0.0-starlite.1`。
