<template>
  <div class="add-page">
    <el-page-header @back="$router.back()">
      <template #content><span class="back-title">{{ isEdit ? '编辑商品' : '新增商品' }}</span></template>
    </el-page-header>

    <el-card shadow="hover" class="form-card">
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" size="default" label-width="auto">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="商品名称" prop="name">
              <el-input v-model="form.name" placeholder="如：美孚1号全合成机油" maxlength="50" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="分类" prop="category">
              <el-select v-model="form.category" placeholder="选择分类" style="width:100%">
                <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="售价(元)" prop="price">
              <el-input-number v-model="form.price" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="进价(元)">
              <el-input-number v-model="form.cost" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="单位">
              <el-input v-model="form.unit" placeholder="如：瓶、个、套" />
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 多规格 -->
        <el-form-item label="规格（可选）">
          <div class="spec-row" v-for="(s, i) in form.specs" :key="i">
            <el-input v-model="form.specs[i]" placeholder="规格名（如：5W-30）" style="width:140px" />
            <el-input-number v-model="form.specPrice[i]" :min="0" :precision="2" placeholder="售价" controls-position="right" style="width:120px" />
            <el-input-number v-model="form.specCost[i]" :min="0" :precision="2" placeholder="进价" controls-position="right" style="width:120px" />
            <el-button type="danger" :icon="Delete" circle size="small" @click="removeSpec(i)" />
          </div>
          <el-button type="primary" text size="small" @click="addSpec"><el-icon><Plus /></el-icon> 添加规格</el-button>
        </el-form-item>

        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="3" placeholder="备注信息" maxlength="200" show-word-limit />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="saving" @click="onSubmit">{{ saving ? '保存中...' : '保存' }}</el-button>
          <el-button @click="$router.back()">取消</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { addProduct, updateProduct, fetchProductDetail } from '@/api/inventory'
import { Plus, Delete } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const route = useRoute()
const router = useRouter()
const isEdit = !!route.params.id
const productId = route.params.id

const categories = ['机油', '滤清器', '刹车片', '轮胎', '电瓶', '火花塞', '雨刷', '灯泡', '冷媒', '清洗类', '添加剂', '皮带', '减震器', '轮毂', '其他']

const formRef = ref(null)
const saving = ref(false)
const form = reactive({
  name: '', category: '', price: 0, cost: 0, unit: '个',
  specs: [], specPrice: [], specCost: [], remark: ''
})

const rules = {
  name: [{ required: true, message: '请输入商品名称', trigger: 'blur' }],
  category: [{ required: true, message: '请选择分类', trigger: 'change' }],
  price: [{ required: true, message: '请输入售价', trigger: 'blur' }]
}

onMounted(async () => {
  if (isEdit && productId) {
    try {
      const p = await fetchProductDetail(productId)
      form.name = p.name || ''
      form.category = p.category || ''
      form.price = p.price || 0
      form.cost = p.cost || 0
      form.unit = p.unit || '个'
      form.specs = p.specs || []
      form.specPrice = (p.specPrice || []).map(s => s.price || 0)
      form.specCost = (p.specCost || []).map(s => s.cost || 0)
      form.remark = p.remark || ''
    } catch (err) {
      ElMessage.error('加载商品信息失败')
    }
  }
})

function addSpec() { form.specs.push(''); form.specPrice.push(form.price); form.specCost.push(form.cost) }
function removeSpec(i) { form.specs.splice(i, 1); form.specPrice.splice(i, 1); form.specCost.splice(i, 1) }

async function onSubmit() {
  try { await formRef.value.validate() } catch { return }
  saving.value = true
  try {
    const data = { ...form, specs: form.specs.filter(s => s.trim()) }
    if (isEdit) {
      await updateProduct(productId, data)
    } else {
      await addProduct(data)
    }
    ElMessage.success(isEdit ? '保存成功' : '添加成功')
    router.push('/inventory/products')
  } catch (err) {
    ElMessage.error(err.message || '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.add-page { max-width: 900px; margin: 0 auto; }
.back-title { font-size: 16px; font-weight: 600; }
.form-card { margin-top: 16px; border-radius: 8px; }
.spec-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
</style>
