<template>
  <div class="member-page">
    <div class="page-header">
      <h2 class="page-title">会员管理</h2>
      <div class="header-right">
        <span class="subtitle" v-if="!loading">共 {{ total }} 位会员</span>
        <el-button type="primary" size="small" @click="$router.push('/members/add')">
          <el-icon><Plus /></el-icon> 新增会员
        </el-button>
        <el-button size="small" :disabled="total === 0 || loading" @click="exportMembers">
          <el-icon><Download /></el-icon> 导出
        </el-button>
      </div>
    </div>

    <!-- 搜索 -->
    <el-card shadow="never" class="search-card">
      <el-row :gutter="12" align="middle">
        <el-col :span="8">
          <el-input
            v-model="searchKeyword"
            placeholder="搜索车牌号 / 车主姓名 / 手机号"
            :prefix-icon="Search"
            clearable
            @keyup.enter="onSearch"
            @clear="onSearch"
          />
        </el-col>
        <el-col :span="3">
          <el-button type="primary" @click="onSearch">
            <el-icon><Search /></el-icon> 搜索
          </el-button>
        </el-col>
      </el-row>
    </el-card>

    <!-- 加载 -->
    <div v-if="loading" class="loading-wrapper">
      <el-skeleton :rows="8" animated />
    </div>

    <!-- 错误 -->
    <div v-else-if="loadError" class="error-wrapper">
      <el-alert :title="loadError" type="error" show-icon :closable="false" />
      <el-button type="primary" class="retry-btn" @click="loadData">重新加载</el-button>
    </div>

    <!-- 空态 -->
    <div v-else-if="total === 0" class="empty-wrapper">
      <el-empty description="暂无会员数据" />
    </div>

    <!-- 表格 -->
    <el-card v-else shadow="hover" class="table-card">
      <el-table
        :data="memberList"
        stripe
        v-loading="tableLoading"
        @row-click="openDetail"
        highlight-current-row
        class="member-table"
      >
        <el-table-column label="车牌号" width="120" fixed>
          <template #default="{ row }">
            <span class="plate-cell">{{ row.plate || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="ownerName" label="车主" width="90" />
        <el-table-column label="手机号" width="130">
          <template #default="{ row }">
            {{ formatPhone(row.phone) }}
          </template>
        </el-table-column>
        <el-table-column label="等级" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="levelType(row.level)" size="small" effect="dark">
              {{ row.level || '普通' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="余额(元)" width="100" align="right">
          <template #default="{ row }">
            {{ formatYuan(row.balance || 0) }}
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="140">
          <template #default="{ row }">
            <span class="remark-cell">{{ row.remark || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="加入时间" width="160" align="center">
          <template #default="{ row }">
            {{ formatDate(row.createTime, 'YYYY-MM-DD hh:mm') }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" fixed="right" align="center">
          <template #default="{ row }">
            <el-button text size="small" type="primary" @click.stop="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-wrapper" v-if="total > 0">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[15, 30, 50]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="loadData"
          @current-change="loadData"
        />
      </div>
    </el-card>

    <!-- 详情抽屉 -->
    <el-drawer
      v-model="drawerVisible"
      :title="'会员详情 · ' + (currentMember ? currentMember.plate : '')"
      size="420px"
      destroy-on-close
    >
      <template v-if="currentMember">
        <!-- 会员卡片 -->
        <div class="member-card">
          <div class="member-plate">{{ currentMember.plate }}</div>
          <el-tag :type="levelType(currentMember.level)" size="large" effect="dark">
            {{ currentMember.level || '普通会员' }}
          </el-tag>
        </div>

        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="车主">{{ currentMember.ownerName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="手机号">{{ formatPhone(currentMember.phone) }}</el-descriptions-item>
          <el-descriptions-item label="余额">¥{{ formatYuan(currentMember.balance || 0) }}</el-descriptions-item>
          <el-descriptions-item label="加入时间">{{ formatDate(currentMember.createTime, 'YYYY-MM-DD hh:mm:ss') }}</el-descriptions-item>
          <el-descriptions-item label="备注">{{ currentMember.remark || '-' }}</el-descriptions-item>
        </el-descriptions>

        <!-- 快速编辑 -->
        <el-divider />
        <h4 class="section-title">快速编辑</h4>
        <el-form :model="editForm" label-position="top" size="small">
          <el-form-item label="等级">
            <el-select v-model="editForm.level" style="width:100%">
              <el-option label="普通" value="普通" />
              <el-option label="银卡" value="银卡" />
              <el-option label="金卡" value="金卡" />
              <el-option label="钻石" value="钻石" />
            </el-select>
          </el-form-item>
          <el-form-item label="备注">
            <el-input v-model="editForm.remark" type="textarea" :rows="2" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="saving" @click="saveEdit">
              {{ saving ? '保存中...' : '保存' }}
            </el-button>
          </el-form-item>
        </el-form>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { fetchMemberList, updateMember } from '@/api/member'
import { formatYuan, formatPhone, formatDate } from '@/utils/format'
import { exportToCSV } from '@/utils/export'
import { Search, Download, Plus } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

// ============ 状态 ============
const loading = ref(true)
const tableLoading = ref(false)
const loadError = ref('')
const memberList = ref([])
const total = ref(0)

const searchKeyword = ref('')
const currentPage = ref(1)
const pageSize = ref(20)

const drawerVisible = ref(false)
const currentMember = ref(null)
const saving = ref(false)
const editForm = reactive({ level: '', remark: '' })

// ============ 生命周期 ============
onMounted(() => loadData())

// ============ 工具方法 ============
function levelType(level) {
  const map = { '钻石': 'danger', '金卡': 'warning', '银卡': 'info', '普通': '' }
  return map[level] || ''
}

// ============ 方法 ============
async function loadData() {
  tableLoading.value = true
  loadError.value = ''
  try {
    const result = await fetchMemberList({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchKeyword.value
    })
    memberList.value = result.list
    total.value = result.total
  } catch (err) {
    loadError.value = err.message || '加载会员数据失败'
  } finally {
    loading.value = false
    tableLoading.value = false
  }
}

function onSearch() {
  currentPage.value = 1
  loadData()
}

function openDetail(member) {
  currentMember.value = member
  editForm.level = member.level || '普通'
  editForm.remark = member.remark || ''
  drawerVisible.value = true
}

async function saveEdit() {
  if (!currentMember.value) return
  saving.value = true
  try {
    await updateMember(currentMember.value._id, { ...editForm })
    // 乐观更新
    Object.assign(currentMember.value, { ...editForm })
    const idx = memberList.value.findIndex(m => m._id === currentMember.value._id)
    if (idx !== -1) Object.assign(memberList.value[idx], { ...editForm })
    ElMessage.success('保存成功')
  } catch (err) {
    ElMessage.error(err.message || '保存失败')
  } finally {
    saving.value = false
  }
}

function exportMembers() {
  try {
    const columns = [
      { key: 'plate', label: '车牌号' },
      { key: 'ownerName', label: '车主姓名' },
      { key: 'phone', label: '手机号' },
      { key: 'level', label: '会员等级' },
      { key: 'balance', label: '余额(元)' },
      { key: 'createTime', label: '注册时间' }
    ]
    const rows = memberList.value.map(m => ({
      ...m,
      balance: formatYuan(m.balance || 0),
      createTime: formatDate(m.createTime, 'YYYY-MM-DD hh:mm')
    }))
    const now = formatDate(new Date(), 'YYYYMMDD')
    exportToCSV(`会员导出_${now}`, rows, columns)
    ElMessage.success(`已导出 ${rows.length} 条记录`)
  } catch (err) {
    ElMessage.error(err.message || '导出失败')
  }
}
</script>

<style scoped>
.member-page { max-width: 1400px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.page-title { margin: 0; font-size: 20px; font-weight: 600; color: #333; }
.header-right { display: flex; align-items: center; gap: 12px; }
.subtitle { font-size: 13px; color: #999; }
.search-card { margin-bottom: 16px; border-radius: 8px; }
.search-card :deep(.el-card__body) { padding: 16px 20px; }
.loading-wrapper { padding: 20px 0; }
.error-wrapper { text-align: center; padding: 40px 0; }
.retry-btn { margin-top: 16px; }
.empty-wrapper { padding: 60px 0; }
.table-card { border-radius: 8px; }
.table-card :deep(.el-card__body) { padding: 0; }
.member-table { cursor: pointer; }
.plate-cell { font-weight: 600; font-family: 'Helvetica Neue', monospace; color: #333; }
.remark-cell { color: #666; font-size: 13px; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
.pagination-wrapper { padding: 16px 20px; display: flex; justify-content: flex-end; }

.member-card {
  background: linear-gradient(135deg, #e6a23c 0%, #f0ad4e 100%);
  color: #fff;
  border-radius: 12px;
  padding: 28px;
  margin-bottom: 16px;
  text-align: center;
}
.member-plate {
  font-size: 22px;
  font-weight: 700;
  font-family: 'Helvetica Neue', monospace;
  margin-bottom: 8px;
}
.section-title { margin: 8px 0 10px; font-size: 14px; font-weight: 600; color: #333; }
</style>
