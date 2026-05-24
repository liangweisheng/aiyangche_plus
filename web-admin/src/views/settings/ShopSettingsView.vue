<template>
  <div class="settings-page">
    <div class="page-header">
      <h2 class="page-title">门店设置</h2>
    </div>

    <div v-if="loading" class="loading-wrapper"><el-skeleton :rows="6" animated /></div>

    <template v-else>
      <!-- 基本信息 -->
      <el-card shadow="hover" class="section-card">
        <template #header><span class="card-title">基本信息</span></template>
        <el-form label-position="top" size="default">
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="门店名称">
                <el-input v-model="editName" placeholder="门店名称" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="联系电话">
                <el-input v-model="editTel" placeholder="联系电话" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="门店地址">
            <el-input v-model="editAddr" placeholder="门店地址" />
          </el-form-item>
          <el-form-item label="管理员昵称">
            <el-input v-model="editDisplayName" placeholder="管理员昵称" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="saving" @click="saveInfo">保存信息</el-button>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- Pro 状态 -->
      <el-card shadow="hover" class="section-card">
        <template #header><span class="card-title">版本信息</span></template>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="当前版本">
            <el-tag :type="userStore.isPro ? 'warning' : 'info'" effect="dark">
              {{ userStore.isPro ? 'Pro 版' : '免费版' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="到期时间">
            {{ userStore.expireTime ? formatDate(userStore.expireTime, 'YYYY-MM-DD') : '无限制' }}
          </el-descriptions-item>
          <el-descriptions-item label="门店码">
            <strong>{{ userStore.shopCode }}</strong>
          </el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- 员工管理 (Pro 功能) -->
      <el-card v-if="userStore.isPro" shadow="hover" class="section-card">
        <template #header>
          <div class="card-header-row">
            <span class="card-title">员工管理</span>
            <el-button type="primary" size="small" @click="showAddStaff = true">
              <el-icon><Plus /></el-icon> 添加员工
            </el-button>
          </div>
        </template>
        <el-table :data="staffList" size="small" stripe v-loading="staffLoading">
          <el-table-column prop="displayName" label="姓名" width="100" />
          <el-table-column prop="phone" label="手机号" width="130">
            <template #default="{ row }">{{ formatPhone(row.phone) }}</template>
          </el-table-column>
          <el-table-column label="角色" width="110" align="center">
            <template #default="{ row }">
              <el-tag :type="row.role === 'admin' ? 'warning' : 'info'" size="small" effect="dark">
                {{ row.role === 'admin' ? '管理员' : '店员' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.status === 'active'" type="success" size="small">正常</el-tag>
              <el-tag v-else type="danger" size="small">{{ row.status || '-' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="addedTime" label="添加时间" width="110">
            <template #default="{ row }">{{ row.addedTime ? formatDate(row.addedTime, 'MM-DD') : '-' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right" align="center">
            <template #default="{ row }">
              <el-button text size="small" @click="toggleRole(row)">
                {{ row.role === 'admin' ? '降为店员' : '升为管理员' }}
              </el-button>
              <el-popconfirm title="确定移除该员工？" @confirm="handleRemove(row)">
                <template #reference>
                  <el-button text size="small" type="danger">移除</el-button>
                </template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="!staffLoading && staffList.length === 0" class="no-data">暂无员工</div>
      </el-card>
    </template>

    <!-- 添加员工弹窗 -->
    <el-dialog v-model="showAddStaff" title="添加员工" width="420px" destroy-on-close>
      <el-form ref="staffForm" :model="newStaff" :rules="staffRules" label-position="top" size="default">
        <el-form-item label="手机号" prop="phone">
          <el-input v-model="newStaff.phone" placeholder="11位手机号" maxlength="11" />
        </el-form-item>
        <el-form-item label="姓名" prop="displayName">
          <el-input v-model="newStaff.displayName" placeholder="员工姓名" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="newStaff.role" style="width:100%">
            <el-option label="店员" value="staff" />
            <el-option label="管理员" value="admin" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddStaff = false">取消</el-button>
        <el-button type="primary" :loading="addingStaff" @click="doAddStaff">确认添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useUserStore } from '@/stores/user'
import { fetchShopProfile, updateShopInfo, fetchStaffList, addStaff, removeStaff, updateStaffRole } from '@/api/shop'
import { formatPhone, formatDate } from '@/utils/format'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const userStore = useUserStore()

// ============ 状态 ============
const loading = ref(true)
const saving = ref(false)

// 基本信息
const editName = ref('')
const editTel = ref('')
const editAddr = ref('')
const editDisplayName = ref('')

// 员工
const staffLoading = ref(false)
const staffList = ref([])
const showAddStaff = ref(false)
const addingStaff = ref(false)
const staffForm = ref(null)
const newStaff = reactive({ phone: '', displayName: '', role: 'staff' })
const staffRules = {
  phone: [{ required: true, message: '请输入手机号', trigger: 'blur' }, { pattern: /^1\d{10}$/, message: '格式错误', trigger: 'blur' }],
  displayName: [{ required: true, message: '请输入姓名', trigger: 'blur' }]
}

// ============ 生命周期 ============
onMounted(async () => {
  loading.value = true
  try {
    const profile = await fetchShopProfile()
    editName.value = profile.name || userStore.shopName
    editTel.value = profile.shopTel || ''
    editAddr.value = profile.shopAddr || ''
    editDisplayName.value = profile.displayName || ''
  } catch (err) {
    // 兜底用 store 数据
    editName.value = userStore.shopName
  }

  if (userStore.isPro) {
    loadStaff()
  }
  loading.value = false
})

// ============ 方法 ============

async function saveInfo() {
  saving.value = true
  try {
    const fields = { name: editName.value, shopTel: editTel.value, shopAddr: editAddr.value, displayName: editDisplayName.value }
    for (const [f, v] of Object.entries(fields)) {
      if (v !== undefined) {
        await updateShopInfo(f, v)
        if (f === 'name') userStore.shopName = v
      }
    }
    ElMessage.success('保存成功')
  } catch (err) {
    ElMessage.error(err.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function loadStaff() {
  staffLoading.value = true
  try {
    staffList.value = await fetchStaffList()
  } catch (err) {
    ElMessage.error('加载员工列表失败')
  } finally {
    staffLoading.value = false
  }
}

async function doAddStaff() {
  addingStaff.value = true
  try {
    // 先触发表单验证
    await staffForm.value.validate()
    await addStaff(newStaff.phone, newStaff.displayName, newStaff.role)
    ElMessage.success('添加成功')
    showAddStaff.value = false
    newStaff.phone = ''
    newStaff.displayName = ''
    newStaff.role = 'staff'
    loadStaff()
  } catch (err) {
    if (err !== undefined) { // validate() 失败时 err 为验证结果对象，不弹 error
      ElMessage.error(err.message || '添加失败')
    }
  } finally {
    addingStaff.value = false
  }
}

async function handleRemove(row) {
  try {
    await removeStaff(row._id)
    ElMessage.success('已移除')
    loadStaff()
  } catch (err) {
    ElMessage.error(err.message || '移除失败')
  }
}

async function toggleRole(row) {
  const newRole = row.role === 'admin' ? 'staff' : 'admin'
  try {
    await updateStaffRole(row._id, newRole)
    ElMessage.success('角色已更新')
    loadStaff()
  } catch (err) {
    ElMessage.error(err.message || '更新失败')
  }
}
</script>

<style scoped>
.settings-page { max-width: 900px; margin: 0 auto; }
.page-header { margin-bottom: 16px; }
.page-title { margin: 0; font-size: 20px; font-weight: 600; }
.loading-wrapper { padding: 20px 0; }
.section-card { margin-bottom: 16px; border-radius: 8px; }
.card-title { font-size: 15px; font-weight: 600; }
.card-header-row { display: flex; justify-content: space-between; align-items: center; }
.no-data { text-align: center; color: #ccc; padding: 30px 0; }
</style>
