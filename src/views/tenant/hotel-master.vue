<template>
  <div class="admin-page">
    <div class="page-header">
      <div>
        <h2>酒店资料</h2>
        <p class="subtle">维护酒店基本信息与封面图；房型、房价计划只读展示。</p>
      </div>
      <div class="header-actions">
        <el-button @click="router.back()">返回酒店前台</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存资料</el-button>
      </div>
    </div>

    <el-form :model="form" label-width="110px" class="master-form">
      <el-form-item label="酒店">
        <el-select v-model="form.id" style="width:100%" @change="loadHotelData">
          <el-option v-for="hotel in hotels" :key="hotel.id" :label="hotel.name" :value="hotel.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="名称"><el-input v-model="form.name" maxlength="128" /></el-form-item>
      <el-form-item label="地址"><el-input v-model="form.address" maxlength="255" /></el-form-item>
      <el-form-item label="封面图 URL">
        <el-input v-model="form.coverImageUrl" maxlength="512" placeholder="/c/assets/hotel-cover.svg" />
      </el-form-item>
      <el-form-item label="封面预览">
        <img v-if="form.coverImageUrl" class="cover-preview" :src="form.coverImageUrl" alt="酒店封面" />
        <span v-else class="subtle">未配置封面</span>
      </el-form-item>
      <el-form-item label="时区"><el-input v-model="form.timezone" maxlength="64" /></el-form-item>
      <el-form-item label="入住 / 退房">
        <el-input v-model="form.checkInTime" placeholder="14:00" style="width:120px" />
        <el-input v-model="form.checkOutTime" placeholder="12:00" style="width:120px;margin-left:8px" />
      </el-form-item>
    </el-form>

    <div class="section-head"><h2>房型</h2><span></span></div>
    <el-table :data="roomTypes" stripe>
      <el-table-column prop="code" label="编码" width="120" />
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="capacity" label="可住人数" width="110" />
      <el-table-column prop="bedType" label="床型" width="120" />
      <el-table-column prop="areaSqm" label="面积" width="100" />
    </el-table>

    <div class="section-head"><h2>房价计划</h2><span></span></div>
    <el-table :data="ratePlans" stripe>
      <el-table-column prop="code" label="编码" width="120" />
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="basePriceMinor" label="基础价（分）" width="140" />
      <el-table-column prop="currency" label="币种" width="100" />
    </el-table>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { listHotelRatePlans, listHotelRoomTypes, listHotels } from '@/api/hotel'
import { updateHotel } from '@/api/hotel-master'

const router = useRouter()
const hotels = ref([])
const roomTypes = ref([])
const ratePlans = ref([])
const saving = ref(false)
const form = reactive({
  id: null, name: '', address: '', coverImageUrl: '', timezone: 'Asia/Shanghai',
  checkInTime: '14:00', checkOutTime: '12:00',
})

async function loadHotelData() {
  const hotel = hotels.value.find((item) => item.id === form.id)
  if (!hotel) return
  Object.assign(form, {
    name: hotel.name || '',
    address: hotel.address || '',
    coverImageUrl: hotel.coverImageUrl || '',
    timezone: hotel.timezone || 'Asia/Shanghai',
    checkInTime: hotel.checkInTime || '14:00',
    checkOutTime: hotel.checkOutTime || '12:00',
  })
  const [types, plans] = await Promise.all([
    listHotelRoomTypes(form.id),
    listHotelRatePlans(form.id),
  ])
  roomTypes.value = types || []
  ratePlans.value = plans || []
}

async function save() {
  if (!form.id) return
  saving.value = true
  try {
    await updateHotel(form.id, {
      name: form.name,
      address: form.address,
      coverImageUrl: form.coverImageUrl,
      timezone: form.timezone,
      checkInTime: form.checkInTime,
      checkOutTime: form.checkOutTime,
    })
    ElMessage.success('酒店资料已保存')
    await loadHotelData()
  } catch (error) {
    ElMessage.error('保存失败，请稍后重试')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  hotels.value = (await listHotels()) || []
  if (hotels.value.length) {
    form.id = hotels.value[0].id
    await loadHotelData()
  }
})
</script>

<style scoped>
.master-form { max-width: 760px; margin-bottom: 24px; }
.cover-preview { width: 240px; max-height: 150px; object-fit: cover; border-radius: 10px; }
.section-head { display: flex; align-items: center; justify-content: space-between; margin: 26px 0 10px; }
</style>
