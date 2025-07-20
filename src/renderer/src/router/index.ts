import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    component: () => import('../views/MainLayout.vue'),
    children: [
      {
        path: '',
        name: 'Home',
        component: () => import('../views/Home.vue')
      },
      {
        path: 'chat/:id',
        name: 'Chat',
        component: () => import('../views/Chat.vue'),
        props: true
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('../views/Settings.vue')
      },
      {
        path: 'assistants',
        name: 'Assistants',
        component: () => import('../views/Assistants.vue')
      },
      {
        path: 'models',
        name: 'Models',
        component: () => import('../views/Models.vue')
      },
      {
        path: 'notes',
        name: 'Notes',
        component: () => import('../views/Notes.vue')
      }
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router