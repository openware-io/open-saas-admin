<template>
  <!--
    Element Plus 按需引入（unplugin-vue-components）**不会自带语言包**，默认是英文：
    日期区间控件的月份/星期/「开始日期/结束日期」、分页的「Total …」、表格空数据「No Data」、
    确认框按钮「OK/Cancel」都会是英文。这里统一挂简体中文语言包，与后台整体语言一致。
    （ElConfigProvider 会把 locale 落到 Element Plus 的模块级 globalConfig，
    因此 ElMessageBox / ElMessage / ElNotification 这些函数式组件也一并变中文。）
  -->
  <ElConfigProvider :locale="zhCn">
    <router-view />
  </ElConfigProvider>
</template>

<script setup>
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
</script>
