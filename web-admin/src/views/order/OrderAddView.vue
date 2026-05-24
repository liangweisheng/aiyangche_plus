<template>
  <div class="order-add-page">
    <div class="page-header">
      <el-button :icon="ArrowLeft" @click="goBack" text>返回</el-button>
      <h2 class="page-title">新开工单</h2>
    </div>

    <!-- Step 1: 选择车辆 -->
    <el-card v-if="step === 1" shadow="never" class="form-card">
      <el-alert
        title="请先搜索并选择车辆，确认车主信息"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom:20px"
      />

      <el-input
        v-model="searchPlate"
        placeholder="搜索车牌号（如：京A12345）"
        :prefix-icon="Search"
        clearable
        size="large"
        @keyup.enter="searchCar"
        @clear="carResults = []"
      >
        <template #append>
          <el-button :icon="Search" :loading="searching" @click="searchCar">搜索</el-button>
        </template>
      </el-input>

      <div v-if="carResults.length > 0" class="car-results">
        <el-table :data="carResults" stripe @row-click="selectCar" highlight-current-row>
          <el-table-column prop="plate" label="车牌号" width="120" />
          <el-table-column prop="ownerName" label="车主" width="100" />
          <el-table-column prop="carType" label="车型" width="80">
            <template #default="{ row }">
              <el-tag v-if="row.carType" size="small" effect="plain">{{ row.carType }}</el-tag>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="会员" width="80" align="center">
            <template #default="{ row }">
              <el-tag v-if="isVip(row)" type="warning" size="small" effect="dark">VIP</el-tag>
              <span v-else class="text-muted">-</span>
            </template>
          </el-table-column>
          <el-table-column label="已消费(元)" width="110" align="right">
            <template #default="{ row }">
              {{ formatYuan(getOrderAmount(row)) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button size="small" type="primary" @click.stop="selectCar(row)">选择</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <el-empty v-if="!searching && searchPlate && carResults.length === 0" description="未找到匹配车辆">
        <template #default>
          <div style="margin-top:8px; display:flex; gap:12px; justify-content:center; flex-wrap:wrap">
            <el-button type="primary" @click="goAddCar">＋ 新增车辆</el-button>
            <el-button @click="goScanPlate">📷 拍照识牌（扫码）</el-button>
          </div>
        </template>
      </el-empty>
    </el-card>

    <!-- Step 2: 填写工单详情 -->
    <el-card v-if="step === 2" shadow="never" class="form-card">
      <!-- 选中的车辆信息 -->
      <div class="selected-car-bar">
        <div class="car-info">
          <span class="car-plate">{{ selectedCar.plate }}</span>
          <span v-if="selectedCar.ownerName" class="car-owner">{{ selectedCar.ownerName }}</span>
          <el-tag v-if="isVip(selectedCar)" type="warning" size="small" effect="dark">VIP</el-tag>
          <span v-if="selectedCar.phone" class="car-phone">{{ formatPhone(selectedCar.phone) }}</span>
        </div>
        <el-button link type="primary" size="small" @click="step = 1">更换车辆</el-button>
      </div>

      <!-- ★ 权益核销条（有可用权益时显示） -->
      <div
        v-if="selectedMember && selectedMember.benefits && selectedMember.benefits.length > 0"
        class="benefit-bar"
      >
        <div class="benefit-header">
          <span class="benefit-label">
            <el-icon><Present /></el-icon> 权益卡
          </span>
          <span class="benefit-hint">选择一项权益进行核销，将自动扣减并生成核销工单</span>
        </div>
        <div class="benefit-cards">
          <div
            v-for="(benefit, idx) in selectedMember.benefits"
            :key="idx"
            class="benefit-card"
            :class="{ 'benefit-empty': (benefit.remain || 0) <= 0 }"
          >
            <div class="benefit-card-top">
              <span class="benefit-card-name">{{ benefit.name }}</span>
              <el-tag :type="(benefit.remain || 0) > 0 ? 'success' : 'info'" size="small" effect="dark">
                {{ benefit.remain || 0 }} / {{ benefit.total || 0 }} 次
              </el-tag>
            </div>
            <div v-if="benefit.remark" class="benefit-card-desc">{{ benefit.remark }}</div>
            <div class="benefit-card-actions">
              <el-button
                size="small"
                type="warning"
                :loading="benefitRedeeming"
                :disabled="(benefit.remain || 0) <= 0 || benefitRedeeming"
                @click="handleUseBenefit(benefit, idx)"
              >
                核销 1 次
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        label-width="100px"
        label-position="right"
        size="default"
      >
        <el-divider content-position="left">服务项目</el-divider>

        <div v-if="form.items.length === 0" class="items-empty">
          <span class="text-muted">暂未添加服务项目</span>
          <el-button type="primary" link @click="addItem">+ 添加服务项目</el-button>
          <el-button type="success" link @click="openProductDialog">+ 选择商品</el-button>
        </div>

        <div v-for="(item, idx) in form.items" :key="idx" class="item-row" :class="{ 'product-item': item._fromProduct }">
          <el-row :gutter="10" align="middle">
            <el-col :span="6">
              <el-input v-model="item.name" placeholder="项目名称" />
            </el-col>
            <el-col :span="3">
              <el-input v-model="item.spec" placeholder="规格" />
            </el-col>
            <el-col :span="3">
              <el-input-number v-model="item.qty" :min="1" placeholder="数量" controls-position="right" style="width:100%" />
            </el-col>
            <el-col :span="4">
              <el-input-number v-model="item.amount" :min="0" :precision="2" placeholder="金额" controls-position="right" style="width:100%" />
            </el-col>
            <el-col :span="4">
              <el-input v-model="item.category" placeholder="分类" />
            </el-col>
            <el-col :span="2">
              <el-button type="danger" link @click="removeItem(idx)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </el-col>
            <el-col v-if="item._fromProduct" :span="1">
              <el-tag type="success" size="small" effect="dark" title="关联库存，保存时将扣减">库</el-tag>
            </el-col>
          </el-row>
        </div>

        <el-button v-if="form.items.length > 0" type="primary" link size="small" style="margin-top:8px" @click="addItem">
          + 添加更多项目
        </el-button>
        <el-button v-if="form.items.length > 0" type="success" link size="small" style="margin-top:8px; margin-left:8px" @click="openProductDialog">
          + 选择商品
        </el-button>

        <!-- 汇总 -->
        <div v-if="form.items.length > 0" class="summary-bar">
          <span>合计：</span>
          <strong class="summary-amount">¥{{ formatYuan(totalAmount) }}</strong>
        </div>

        <el-divider content-position="left">收款信息</el-divider>

        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="实收金额">
              <el-input-number v-model="form.paidAmount" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="支付方式">
              <el-select v-model="form.payMethod" style="width:100%">
                <el-option label="现金" value="cash" />
                <el-option label="微信" value="wechat" />
                <el-option label="支付宝" value="alipay" />
                <el-option label="刷卡" value="card" />
                <el-option label="挂账" value="credit" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="工单状态">
              <el-select v-model="form.status" style="width:100%">
                <el-option label="已完成" value="已完成" />
                <el-option label="施工中" value="施工中" />
                <el-option label="待结算" value="待结算" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">补充信息</el-divider>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="保养到期">
              <el-date-picker
                v-model="form.setMaintainDate"
                type="date"
                placeholder="选择日期（可选）"
                value-format="YYYY-MM-DD"
                style="width:100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="里程(km)">
              <el-input-number v-model="form.setMileage" :min="0" :step="10000" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="工单备注（可选）" />
        </el-form-item>

        <div class="form-actions">
          <el-button @click="step = 1">上一步</el-button>
          <el-button type="success" :loading="saving" @click="handleSave('施工中')">
            暂存（施工中）
          </el-button>
          <el-button type="primary" :loading="saving" @click="handleSave('已完成')" size="large">
            完成开单
          </el-button>
        </div>
      </el-form>
    </el-card>

    <!-- 商品选择弹窗 -->
    <el-dialog v-model="showProductDialog" title="选择商品" width="850px" destroy-on-close @opened="loadProducts">
      <el-input
        v-model="productSearchKeyword"
        placeholder="搜索商品..."
        clearable
        style="margin-bottom:16px; width:320px"
        @input="filterProducts"
      >
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <el-table
        :data="displayedProductList"
        stripe
        max-height="420"
        highlight-current-row
        v-loading="productLoading"
      >
        <el-table-column prop="name" label="商品名称" min-width="140" show-overflow-tooltip />
        <el-table-column prop="category" label="分类" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.category" size="small" effect="plain">{{ row.category }}</el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="规格 / 库存" width="200">
          <template #default="{ row }">
            <template v-if="row.specs && row.specs.length > 0">
              <el-select
                :model-value="selectedSpecForRow[row._id] || ''"
                placeholder="选择规格"
                size="small"
                clearable
                style="width:185px"
                @update:model-value="(val) => selectedSpecForRow[row._id] = val"
                @click.stop
              >
                <el-option
                  v-for="s in row.specs"
                  :key="s.label"
                  :label="`${s.label}（库存 ${s.stock}）`"
                  :value="s.label"
                  :disabled="(s.stock || 0) <= 0"
                />
              </el-select>
            </template>
            <span v-else class="stock-text">库存 {{ row.stock || 0 }}</span>
          </template>
        </el-table-column>
        <el-table-column label="单价" width="90" align="right">
          <template #default="{ row }">¥{{ formatYuan(row.sellPrice || 0) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="center">
          <template #default="{ row }">
            <el-button
              size="small"
              type="primary"
              :disabled="!canSelectProduct(row)"
              @click="selectProduct(row)"
            >
              选择
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty
        v-if="!productLoading && displayedProductList.length === 0"
        :description="productSearchKeyword ? '未找到匹配商品' : '暂无商品，请先在「进销存」中添加'"
      />
      <template #footer>
        <el-button @click="showProductDialog = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { fetchCarList } from '@/api/car'
import { createOrder } from '@/api/order'
import { fetchProductList, deductStock } from '@/api/inventory'
import { useBenefit, fetchMemberByPlate } from '@/api/member'
import { formatYuan, formatPhone } from '@/utils/format'
import { ArrowLeft, Search, Delete, Present } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const router = useRouter()
const formRef = ref(null)
const saving = ref(false)
const step = ref(1)

const searchPlate = ref('')
const searching = ref(false)
const carResults = ref([])
const memberMap = ref({})
const orderStatsMap = ref({})

// ★ 自动搜索：输入 ≥5 位时 debounce 300ms 自动触发
let autoSearchTimer = null
onMounted(() => {
  watch(searchPlate, (newVal) => {
    if (autoSearchTimer) clearTimeout(autoSearchTimer)
    const trimmed = (newVal || '').trim()
    // 仅当长度 ≥ 5（完整车牌最小长度）时自动搜索
    if (trimmed.length >= 5) {
      autoSearchTimer = setTimeout(() => {
        searchCar()
      }, 300)
    }
  })
})
onUnmounted(() => {
  if (autoSearchTimer) clearTimeout(autoSearchTimer)
})

const selectedCar = ref({})

// ★ 权益核销相关
const selectedMember = ref(null)       // 当前选中车辆的会员记录
const benefitRedeeming = ref(false)    // 正在核销中

// 商品选择弹窗
const showProductDialog = ref(false)
const productList = ref([])
const productSearchKeyword = ref('')
const productLoading = ref(false)
const selectedSpecForRow = ref({})

const form = reactive({
  items: [],      // [{name, spec, qty, amount, category}]
  paidAmount: 0,
  payMethod: 'cash',
  status: '已完成',
  setMaintainDate: '',
  setMileage: 0,
  remark: ''
})

const totalAmount = computed(() => {
  return form.items.reduce((sum, item) => sum + (Number(item.amount) || 0) * (Number(item.qty) || 1), 0)
})

// 商品列表（客户端关键字过滤）
const displayedProductList = computed(() => {
  const kw = productSearchKeyword.value.trim().toLowerCase()
  if (!kw) return productList.value
  return productList.value.filter(p =>
    (p.name && p.name.toLowerCase().includes(kw)) ||
    (p.category && p.category.toLowerCase().includes(kw))
  )
})

function goBack() {
  router.push('/orders')
}

function goAddCar() {
  router.push('/cars/add')
}

function goScanPlate() {
  // Web 端扫码提示
  ElMessage.info('请使用小程序端扫码识别车牌号')
}

function isVip(car) {
  return !!memberMap.value[car.plate]
}

function getOrderAmount(car) {
  const stats = orderStatsMap.value[car.plate]
  return stats ? stats.totalAmount : 0
}

async function searchCar() {
  if (!searchPlate.value.trim()) return
  searching.value = true
  try {
    const result = await fetchCarList()
    memberMap.value = result.memberMap
    orderStatsMap.value = result.orderStats

    const kw = searchPlate.value.trim().toLowerCase()
    carResults.value = result.list.filter(car =>
      car.plate && car.plate.toLowerCase().includes(kw)
    )
    if (carResults.value.length === 0) {
      ElMessage.info('未找到匹配车辆')
    }
  } catch (err) {
    ElMessage.error(err.message || '搜索失败')
  } finally {
    searching.value = false
  }
}

async function selectCar(car) {
  selectedCar.value = car
  selectedMember.value = null  // 重置
  form.items = [{ name: '', spec: '', qty: 1, amount: 0, category: '' }]
  form.paidAmount = 0
  form.payMethod = 'cash'
  form.status = '已完成'
  form.setMaintainDate = ''
  form.setMileage = car.mileage || 0
  form.remark = ''
  step.value = 2

  // ★ 异步查询会员权益（非阻塞）
  if (isVip(car)) {
    try {
      const member = await fetchMemberByPlate(car.plate)
      selectedMember.value = member
    } catch (e) {
      // 静默失败，会员信息不关键
    }
  }
}

function addItem() {
  form.items.push({ name: '', spec: '', qty: 1, amount: 0, category: '' })
}

function removeItem(idx) {
  form.items.splice(idx, 1)
}

// ========== 商品选择（库存集成）==========

/** 打开商品选择弹窗 */
async function openProductDialog() {
  showProductDialog.value = true
  productSearchKeyword.value = ''
  selectedSpecForRow.value = {}
  if (productList.value.length === 0) {
    await loadProducts()
  }
}

/** 加载全部在售商品 */
async function loadProducts() {
  productLoading.value = true
  try {
    const result = await fetchProductList({ status: 'on_shelf', pageSize: 200 })
    productList.value = result.list || []
  } catch (err) {
    ElMessage.error(err.message || '加载商品失败')
  } finally {
    productLoading.value = false
  }
}

/** 搜索过滤（客户端） */
function filterProducts() {
  // displayedProductList 是 computed，自动根据 productSearchKeyword 过滤
}

/** 能否选择该商品（库存 > 0；有规格时需先选中规格） */
function canSelectProduct(product) {
  if (product.specs && product.specs.length > 0) {
    const sel = selectedSpecForRow.value[product._id]
    if (!sel) return false
    const specObj = product.specs.find(s => s.label === sel)
    return specObj && (specObj.stock || 0) > 0
  }
  return (product.stock || 0) > 0
}

/** 选择商品 → 添加到服务项目列表 */
function selectProduct(product) {
  const spec = selectedSpecForRow.value[product._id] || ''

  // 有规格但未选择
  if (product.specs && product.specs.length > 0 && !spec) {
    ElMessage.warning(`请先选择「${product.name}」的规格`)
    return
  }

  // 查规格信息获取库存/价格
  let specStock = product.stock || 0
  let specPrice = product.sellPrice || 0
  let specCost = product.costPrice || 0
  if (spec && product.specs) {
    const sObj = product.specs.find(s => s.label === spec)
    if (sObj) {
      specStock = sObj.stock || 0
      specPrice = sObj.price || sObj.sellPrice || product.sellPrice || 0
      specCost = sObj.cost || sObj.costPrice || product.costPrice || 0
    }
  }

  if (specStock <= 0) {
    ElMessage.warning('该规格库存不足')
    return
  }

  form.items.push({
    name: product.name,
    spec,
    qty: 1,
    amount: specPrice,
    category: product.category || '',
    // ★ 库存扣减标记（对应小程序 _fromProduct 字段）
    _fromProduct: true,
    _productId: product._id,
    _productItemSpec: spec,
    _productQuantity: 1,
    _productCategory: product.category || '',
    _productCost: specCost
  })

  ElMessage.success(`已添加：${product.name}`)
}

// ★ 权益核销：弹确认 → 调用 useBenefit → 刷新页面
async function handleUseBenefit(benefit, idx) {
  const member = selectedMember.value
  if (!member || !benefit) return

  const remain = benefit.remain || 0
  if (remain <= 0) {
    ElMessage.warning('该权益剩余次数已用完')
    return
  }

  const newRemain = remain - 1
  try {
    await ElMessageBox.confirm(
      `确认为「${selectedCar.value.plate}」使用 1 次权益「${benefit.name}」吗？\n剩余次数：${remain} → ${newRemain} 次`,
      '权益核销确认',
      { confirmButtonText: '确认核销', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return // 取消
  }

  benefitRedeeming.value = true
  try {
    await useBenefit({
      memberDocId: member._id,
      benefitIdx: idx,
      newRemain,
      benefitName: benefit.name || '权益',
      benefitTotal: benefit.total || 0,
      plate: selectedCar.value.plate
    })
    ElMessage.success('权益核销成功')

    // 刷新会员记录 + carResults 中的会员状态
    try {
      const updated = await fetchMemberByPlate(selectedCar.value.plate)
      selectedMember.value = updated
    } catch { /* 静默 */ }
  } catch (err) {
    ElMessage.error(err.message || '核销失败')
  } finally {
    benefitRedeeming.value = false
  }
}

async function handleSave(statusOverride) {
  if (!selectedCar.value.plate) return

  // 校验至少有一个服务项目
  const items = form.items.filter(i => i.name.trim())
  if (statusOverride !== '施工中' && items.length === 0) {
    ElMessage.warning('请至少添加一个服务项目')
    return
  }

  saving.value = true
  try {
    // ☆ Step 1: 从 form.items 收集需扣减库存的商品行
    const productItems = []   // 传给 deductStock 云函数
    const deductedItems = []  // 存入订单记录（作废时回滚用）
    let tempOrderRef = ''

    form.items.forEach((item, idx) => {
      if (item._fromProduct && item._productId && (item._productQuantity || item.qty) > 0) {
        const qty = item._productQuantity || item.qty || 1
        productItems.push({
          productId: item._productId,
          spec: item._productItemSpec || '',
          quantity: qty,
          amount: Number(item.amount) || 0
        })
        deductedItems.push({
          productId: item._productId,
          spec: item._productItemSpec || '',
          quantity: qty,
          cost: item._productCost || 0,
          itemName: item.name || '',
          rowIndex: idx,
          category: item._productCategory || ''
        })
      }
    })

    // ☆ Step 2: 扣减库存（暂存模式跳过）
    if (statusOverride !== '施工中' && productItems.length > 0) {
      tempOrderRef = 'OR_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8).toUpperCase()
      await deductStock({
        items: productItems,
        orderRef: tempOrderRef,
        operator: '管理员'
      })
    }

    // Step 3: 构建工单数据
    const serviceItems = items.map(i => `${i.name}${i.spec ? ' ' + i.spec : ''}`).join(',')
    const serviceAmounts = items.map(i => i.amount).join(',')
    const serviceQuantities = items.map(i => i._productQuantity || i.qty).join(',')
    const serviceCategories = items.map(i => i.category || i._productCategory || '').join(',')

    // ★ payMethod 映射：Web端 → 小程序端（1=现付, 2=挂账）
    const payMethodMap = { cash: '1', wechat: '1', alipay: '1', card: '1', credit: '2' }
    const payload = {
      plate: selectedCar.value.plate,
      serviceItems,
      serviceAmounts,
      serviceQuantities,
      serviceCategories,
      totalAmount: totalAmount.value,
      paidAmount: form.paidAmount || totalAmount.value,
      payMethod: payMethodMap[form.payMethod] || '1',
      status: statusOverride,
      remark: form.remark,
      setMaintainDate: form.setMaintainDate,
      setMileage: form.setMileage,
      carDocId: selectedCar.value._id,
      _skipAmountCheck: statusOverride === '施工中'
    }

    // ☆ 存入扣减项记录（作废工单时用于回滚库存）
    if (deductedItems.length > 0) {
      payload._deductedItems = deductedItems
      payload._orderStockRef = tempOrderRef
    }

    await createOrder(payload)

    const label = statusOverride === '施工中' ? '工单暂存成功' : '开单成功'
    ElMessage.success(label)
    router.push('/orders')
  } catch (err) {
    ElMessage.error(err.message || '开单失败')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.order-add-page {
  max-width: 1000px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #333;
}

.form-card {
  border-radius: 8px;
}

.form-card :deep(.el-card__body) {
  padding: 24px 32px;
}

.form-card :deep(.el-divider__text) {
  font-weight: 600;
  font-size: 14px;
  color: #555;
}

.car-results {
  margin-top: 16px;
}

.selected-car-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #f0f7ff;
  border-radius: 8px;
  margin-bottom: 20px;
  border: 1px solid #d6e9ff;
}

.car-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.car-plate {
  font-size: 18px;
  font-weight: 700;
  font-family: 'Helvetica Neue', monospace;
  color: #333;
}

.car-owner {
  color: #666;
  font-size: 14px;
}

.car-phone {
  color: #999;
  font-size: 13px;
}

.items-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
}

.text-muted {
  color: #999;
  font-size: 13px;
}

.item-row {
  margin-bottom: 8px;
  padding: 10px;
  background: #fafafa;
  border-radius: 6px;
}

.item-row.product-item {
  background: #f0faf5;
  border: 1px solid #d4f0e0;
}

.stock-text {
  color: #666;
  font-size: 13px;
}

.summary-bar {
  text-align: right;
  padding: 12px 0;
  font-size: 16px;
  color: #333;
}

.summary-amount {
  font-size: 22px;
  font-family: 'Helvetica Neue', monospace;
  color: #e6a23c;
}

.form-actions {
  margin-top: 32px;
  text-align: center;
  display: flex;
  justify-content: center;
  gap: 12px;
}

/* ===== 权益核销条 ===== */
.benefit-bar {
  margin-bottom: 20px;
  padding: 16px 20px;
  background: #fffaeb;
  border: 1px solid #f5dab1;
  border-radius: 8px;
}

.benefit-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.benefit-label {
  font-weight: 600;
  color: #e6a23c;
  font-size: 15px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.benefit-hint {
  font-size: 12px;
  color: #999;
}

.benefit-cards {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.benefit-card {
  flex: 1;
  min-width: 200px;
  padding: 12px 16px;
  background: #fff;
  border: 1px solid #faecd8;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.benefit-card.benefit-empty {
  opacity: 0.55;
  background: #fafafa;
}

.benefit-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.benefit-card-name {
  font-weight: 600;
  font-size: 14px;
  color: #333;
}

.benefit-card-desc {
  font-size: 12px;
  color: #999;
  line-height: 1.4;
}

.benefit-card-actions {
  text-align: right;
}
</style>
