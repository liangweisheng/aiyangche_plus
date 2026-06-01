<template>
  <div class="car-add-page">
    <div class="page-header">
      <el-button :icon="ArrowLeft" @click="goBack" text>返回</el-button>
      <h2 class="page-title">新增车辆</h2>
    </div>

    <el-card shadow="never" class="form-card">
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="100px"
        label-position="right"
        size="default"
      >
        <el-divider content-position="left">基本信息</el-divider>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="车牌号" prop="plate">
              <el-input v-model="form.plate" placeholder="如：京A12345" maxlength="10" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="车主姓名">
              <el-input v-model="form.ownerName" placeholder="车主姓名" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="手机号">
              <el-input v-model="form.phone" placeholder="11位手机号" maxlength="11" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="VIN码">
              <el-input v-model="form.vin" placeholder="车辆识别代号" maxlength="17" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">车辆信息</el-divider>

        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="车型">
              <el-select v-model="form.carType" placeholder="选择车型" clearable style="width:100%">
                <el-option label="轿车" value="轿车" />
                <el-option label="SUV" value="SUV" />
                <el-option label="MPV" value="MPV" />
                <el-option label="皮卡" value="皮卡" />
                <el-option label="货车" value="货车" />
                <el-option label="客车" value="客车" />
                <el-option label="其他" value="其他" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="颜色">
              <el-select v-model="form.color" placeholder="选择颜色" clearable style="width:100%">
                <el-option label="白色" value="白色" />
                <el-option label="黑色" value="黑色" />
                <el-option label="银色" value="银色" />
                <el-option label="灰色" value="灰色" />
                <el-option label="红色" value="红色" />
                <el-option label="蓝色" value="蓝色" />
                <el-option label="棕色" value="棕色" />
                <el-option label="绿色" value="绿色" />
                <el-option label="黄色" value="黄色" />
                <el-option label="其他" value="其他" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="里程(km)">
              <el-input-number v-model="form.mileage" :min="0" :step="10000" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">到期提醒</el-divider>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="保养到期">
              <el-date-picker
                v-model="form.maintainDate"
                type="date"
                placeholder="选择日期"
                value-format="YYYY-MM-DD"
                style="width:100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="保险到期">
              <el-date-picker
                v-model="form.insuranceDate"
                type="date"
                placeholder="选择日期"
                value-format="YYYY-MM-DD"
                style="width:100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="配件名称">
              <el-input v-model="form.partReplaceName" placeholder="如：刹车片" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="配件更换日期">
              <el-date-picker
                v-model="form.partReplaceDate"
                type="date"
                placeholder="选择日期"
                value-format="YYYY-MM-DD"
                style="width:100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">备注</el-divider>

        <el-form-item label="备注" label-width="100px">
          <el-input v-model="form.remark" type="textarea" :rows="3" placeholder="其他备注信息" />
        </el-form-item>

        <div class="form-actions">
          <el-button type="primary" :loading="saving" @click="handleSave" size="large">
            {{ saving ? '保存中...' : '保存' }}
          </el-button>
          <el-button @click="goBack" size="large">取消</el-button>
        </div>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { addCar } from '@/api/car'
import { ArrowLeft } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const router = useRouter()
const formRef = ref(null)
const saving = ref(false)

const form = reactive({
  plate: '',
  ownerName: '',
  phone: '',
  carType: '',
  color: '',
  mileage: 0,
  vin: '',
  maintainDate: '',
  insuranceDate: '',
  partReplaceName: '',
  partReplaceDate: '',
  remark: ''
})

const rules = {
  plate: [
    { required: true, message: '请输入车牌号', trigger: 'blur' },
    { min: 2, message: '车牌号至少2位', trigger: 'blur' }
  ]
}

function goBack() {
  router.push('/cars')
}

async function handleSave() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  saving.value = true
  try {
    // 过滤空字符串字段
    const payload = {}
    Object.keys(form).forEach(key => {
      const val = form[key]
      if (val !== '' && val !== undefined && val !== null) {
        payload[key] = val
      }
    })

    await addCar(payload)
    ElMessage.success('车辆添加成功')
    router.push('/cars')
  } catch (err) {
    ElMessage.error(err.message || '添加失败')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.car-add-page {
  max-width: 900px;
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

.form-actions {
  margin-top: 32px;
  text-align: center;
  display: flex;
  justify-content: center;
  gap: 16px;
}
</style>
