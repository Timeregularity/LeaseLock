import { Navigate, Route, Routes } from 'react-router-dom'
import { NotFound, ScrollToTop, ToastProvider } from './components'
import { Checkout, EventDetail, EventsPage, Login, Profile, Register, ReservationDetail, ReservationsPage, ReservationSuccess, SeatSelection, WaitlistPage } from './pages/PublicPages'
import { AdminDashboard, AdminEvents, AdminSeats, ConcurrencyDemo, EventForm } from './pages/AdminPages'
import { GuestRoute, ProtectedRoute } from './auth'

export default function App() {
  return <ToastProvider><ScrollToTop/><Routes>
    <Route path="/" element={<Navigate to="/events" replace/>}/>
    <Route path="/login" element={<GuestRoute><Login/></GuestRoute>}/>
    <Route path="/register" element={<GuestRoute><Register/></GuestRoute>}/>
    <Route path="/events" element={<EventsPage/>}/>
    <Route path="/events/:id" element={<EventDetail/>}/>
    <Route path="/events/:id/seats" element={<ProtectedRoute><SeatSelection/></ProtectedRoute>}/>
    <Route path="/checkout/:bookingId" element={<ProtectedRoute><Checkout/></ProtectedRoute>}/>
    <Route path="/reservations" element={<ProtectedRoute><ReservationsPage/></ProtectedRoute>}/>
    <Route path="/reservations/success" element={<ProtectedRoute><ReservationSuccess/></ProtectedRoute>}/>
    <Route path="/reservations/:id" element={<ProtectedRoute><ReservationDetail/></ProtectedRoute>}/>
    <Route path="/waitlist" element={<ProtectedRoute><WaitlistPage/></ProtectedRoute>}/>
    <Route path="/profile" element={<ProtectedRoute><Profile/></ProtectedRoute>}/>
    <Route path="/admin" element={<ProtectedRoute role="ADMIN"><AdminDashboard/></ProtectedRoute>}/>
    <Route path="/admin/events" element={<ProtectedRoute role="ADMIN"><AdminEvents/></ProtectedRoute>}/>
    <Route path="/admin/events/new" element={<ProtectedRoute role="ADMIN"><EventForm/></ProtectedRoute>}/>
    <Route path="/admin/events/:id/edit" element={<ProtectedRoute role="ADMIN"><EventForm/></ProtectedRoute>}/>
    <Route path="/admin/seats" element={<ProtectedRoute role="ADMIN"><AdminSeats/></ProtectedRoute>}/>
    <Route path="/admin/concurrency-demo" element={<ProtectedRoute role="ADMIN"><ConcurrencyDemo/></ProtectedRoute>}/>
    <Route path="*" element={<NotFound/>}/>
  </Routes></ToastProvider>
}
