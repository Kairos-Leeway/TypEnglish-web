import axios from 'axios'
import type { ApiResult } from './types'

const api = axios.create({
  baseURL: 'http://localhost:8080/api',
  timeout: 300000
})

// 请求拦截器: 自动加 token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截器: 自动解包 Result<T> → 直接返回 data
api.interceptors.response.use(
  res => {
    const body = res.data as ApiResult
    // 如果 response.data 是 { code, msg, data } 格式，自动解包
    if (body && typeof body === 'object' && 'code' in body && 'data' in body) {
      if (body.code === 200) {
        // 把解包后的 data 放到 response.data 上，同时保留原始 body
        res.data = body.data
      } else {
        return Promise.reject(new Error(body.msg || '请求失败'))
      }
    }
    return res
  },
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
