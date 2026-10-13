---
name: film-space-control
description: Control local Film Space Lite scenes, abstract actors, cameras, playheads and frame feedback through MCP.
---

# Film Space Lite

先读取项目与 revision。默认创建 blocking-figure。世界单位米，Y 向上；人物朝向为 rotationY 弧度，摄影机用 XYZW 四元数，焦距毫米。

使用 operation schema 与语义批次搭景，不覆盖整份项目。抽象人支持路径 Move（速度）和 Hold（时长、站立或坐下、座位高度），以及整体倾斜与颜色。

搭景使用统一 Blockout 几何和语义对象；GLB 和参考图通过素材导入工具。布景贴图属于项目对象。环境组是一层，重新分组保持世界姿态。

搭景必须避免可见表面共面重叠，防止闪动（z-fighting）：

- 地板、平台和墙面按边界拼接；禁止在同一高度重复覆盖顶面，或在同一平面重复覆盖墙面。同高度相邻拼接允许。
- 创建前按最终世界坐标检查覆盖范围；水平盒子的顶面高度是中心 Y 加半个高度，不能只比较中心 Y。
- 装饰板、线条和贴面要有实际厚度或明确的表面间距。发现重叠时修正几何边界或移除重复表面，不用透明度、固定 renderOrder 或关闭深度测试遮掩。
- 创建后检查主视角；接缝或覆盖关系不清楚时补一个侧视角，确认地板、平台和墙面没有交替闪动。


相机保留机位、Shot、关键帧、插值、Follow、Look At、环绕、手持、景深和焦点跟踪。大改空间后看截图；运镜用指定时间 Camera 抽帧核对。不要让编辑辅助层进入输出。

UI 与 MCP 操作同一份 Lite 项目。旧 revision 必须重新读取后提交。MP4 由用户在网页按钮启动。

新建项目可指定 name、aspectRatio、frameRate、durationSeconds。画幅使用既有五个比例；set_project_aspect_ratio 修改新镜头默认画幅，既有镜头保留各自比例。指定时间截图与网页 MP4 统一固定 1080 像素短边。

人物姿态：通过 record_actor_pose_keyframe(actorID,time,pose) 组合连续参数；角度弧度，正 headPitch 低头、负值抬头；torsoPitch 正值前倾；站坐与腿部形态由 Hold 决定，基准路径由 Move 决定；人物帧接受 offsetX/offsetY/offsetZ 及 rotationYOffset/rotationX/rotationZ/torsoPitch/headPitch。只设置需要接管的通道，边走边鞠躬只写 torsoPitch/headPitch，保留自动朝向和路径。按关键帧时间安排保持和过渡，用指定时间抽帧核对。更新/移动/删除操作与 UI 共用项目和 revision；原有 Hold 站坐继续可用。

网格地面是场景内容，set_ground_visible 控制 Edit、Export、抽帧和 MP4；camera 工作区参数对应网页 Export。

新建 Blockout 几何部件默认 opacity=1；需要透明效果时明确设置 opacity。已有项目的显式透明度保留。

动作内偏移：offsetX/Y/Z 按 Move/Hold 采样朝向（人物帧朝向之前）解释为左右/上下/前后，单位米且不随人物缩放。示例 record_actor_pose_keyframe：time=0 pose={offsetY:0}；time=1 pose={offsetY:1.2,rotationZ:1.5707963267948966}；time=2 pose={offsetX:0,offsetY:0,offsetZ:0,rotationX:0,rotationZ:0}。最后一帧保持；零偏移帧从此前各通道关键帧回到移动中的路径位置，保留自动朝向和 Hold 站坐。

初始绝对面向通过 set_actor_transform.rotationY 设置；record_actor_pose_keyframe 的 rotationYOffset 为相对自动面向偏移，单位弧度。例：time=0 pose={rotationYOffset:0}，time=1 pose={rotationYOffset:0.5235987756}，time=2 pose={rotationYOffset:0}；最后一帧归零后 Move 继续自动转向。新的 pose.rotationY 写入明确拒绝；旧文件由版本迁移转换。
