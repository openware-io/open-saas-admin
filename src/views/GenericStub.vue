<template>
  <div class="admin-page">
    <div class="page-header">
      <h2>页面不存在</h2>
      <el-tag type="info" effect="plain">404</el-tag>
    </div>
    <div class="admin-card">
      <el-empty :description="'当前路径 ' + route.path + ' 没有对应的菜单或页面。'" />
      <div style="text-align:center">
        <el-button type="primary" @click="router.push('/select')">返回后台入口</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
</script>
