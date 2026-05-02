---
name: fix-caradd-page
overview: 修复新增车辆页面两个问题：1) 保存车辆按钮z-index层级提升确保在最上层；2) 云函数addCar补充ownerName和vin字段的处理逻辑
todos:
  - id: fix-footer-zindex
    content: carAdd.wxss 中 .footer 添加 z-index:100 解决按钮被遮挡
    status: completed
  - id: fix-addcar-ownername
    content: repair_main/index.js addCar 函数补充 ownerName 和 vin 字段的接收与写入
    status: completed
---

## Product Overview

修复【新增车辆】（carAdd）页面的两个问题：1) "保存车辆"按钮被表单内容（尤其是原生 input 组件）遮挡；2) 车主姓名 ownerName 字段未保存到云数据库。

## Core Features

- **问题1修复**："保存车辆"固定底部按钮被表单内容遮挡，需要确保按钮在最高层级显示，不被任何表单字段覆盖
- **问题2修复**：云函数 `addCar` action 缺少对 `ownerName` 和 `vin` 字段的接收和写入逻辑，导致这两个字段虽然前端已传递但服务端未存储

## 根因分析

**问题1 - 按钮被遮挡**：

- `.footer` 使用 `position: fixed; bottom: 0` 但未设置 `z-index`
- 页面包含多个 `input`/`textarea` 原生组件，原生组件在聚焦时层级最高
- 表单字段较多时（11个 form-group），滚动到底部区域后，"车主电话"等输入框的视觉位置与底部按钮重叠，且 input 的原生层级高于普通 view 元素
- 修复方案：给 `.footer` 添加 `z-index: 100` 确保始终在最上层

**问题2 - ownerName 未保存**：

- 前端 `carAdd.js` 第112行已正确传递 `ownerName: form.ownerName.trim()`
- 云函数 `addCar` 第156-166行参数接收部分 **缺少** `var ownerName = event.ownerName || ''` 和 `var vin = event.vin || ''`
- 云函数 `addCar` 第183-196行构建 `carData` 对象时 **缺少** `ownerName` 和 `vin` 字段
- 对比 `updateCarInfo` 白名单中已有 `ownerName` 和 `vin`，说明这两个字段是合法的车辆属性

## Tech Stack

- 微信小程序原生开发（WXML + WXSS + JS）
- 云函数 repair_main（Node.js）

## Implementation Approach

### 问题1修复：CSS z-index 层级提升

在 `carAdd.wxss` 的 `.footer` 样式中添加 `z-index: 100`，确保固定底部的"保存车辆"按钮始终显示在所有表单元素（包括原生 input/textarea）之上。同时检查是否需要在 `.container` 上添加 `overflow: hidden` 或调整 padding-bottom 防止内容溢出。

### 问题2修复：云函数 addCar 补充字段

两处修改：

1. 参数接收区（第166行后）：新增 `var ownerName = event.ownerName || ''` 和 `var vin = event.vin || ''`
2. carData 构建区（第194行 remark 后）：新增 `ownerName: (ownerName || '').trim()` 和 `vin: (vin || '').trim()`

## Implementation Notes

- 向后兼容：ownerName/vin 为可选字段，旧数据不受影响
- 云函数需重新部署才能生效
- 仅修改2个文件，不涉及其他页面或功能

## Directory Structure

```
d:\miniprogram\aiyangche\
├── pages/caradd/
│   └── carAdd.wxss          # [MODIFY] .footer 加 z-index: 100
└── cloudfunctions/repair_main/
    └── index.js             # [MODIFY] addCar 函数补充 ownerName + vin 字段
```

## Key Code Structures

### addCar carData 构造（修改后的目标结构）

```javascript
var carData = {
    plate, carNumber, carType, color, mileage, phone,
    maintainDate, insuranceDate, partReplaceName, partReplaceDate,
    remark,
    ownerName: (ownerName || '').trim(),   // 新增
    vin: (vin || '').trim(),               // 新增
    createTime: db.serverDate()
}
```