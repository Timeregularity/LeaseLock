import { render,screen,waitFor } from '@testing-library/react'
import { MemoryRouter,Route,Routes } from 'react-router-dom'
import { afterEach,describe,expect,test,vi } from 'vitest'
import { AuthProvider,ProtectedRoute,useAuth } from './auth'

function Probe(){const {user,loading}=useAuth();return <span>{loading?'loading':user?.role||'guest'}</span>}
afterEach(()=>vi.restoreAllMocks())

describe('authentication integration',()=>{
  test('restores a database session on application load',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({user:{id:'1',fullName:'Admin',email:'admin@example.com',role:'ADMIN'}}),{status:200,headers:{'Content-Type':'application/json'}})));render(<MemoryRouter><AuthProvider><Probe/></AuthProvider></MemoryRouter>);expect(await screen.findByText('ADMIN')).toBeInTheDocument()})
  test('redirects a guest away from a protected route',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({code:'AUTHENTICATION_REQUIRED',message:'Sign in'}),{status:401,headers:{'Content-Type':'application/json'}})));render(<MemoryRouter initialEntries={['/profile']}><AuthProvider><Routes><Route path="/profile" element={<ProtectedRoute><div>Private profile</div></ProtectedRoute>}/><Route path="/login" element={<div>Sign in page</div>}/></Routes></AuthProvider></MemoryRouter>);await waitFor(()=>expect(screen.getByText('Sign in page')).toBeInTheDocument());expect(screen.queryByText('Private profile')).not.toBeInTheDocument()})
})
