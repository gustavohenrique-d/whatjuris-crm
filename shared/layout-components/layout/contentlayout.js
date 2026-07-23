// shared/layout-components/layout/contentlayout.js
// Shell escuro do whatjuris.html: sidebar fixa 220px + main. Mantém o Redux Provider.
// O DealDrawerProvider + <DealDrawer/> ficam aqui para o drawer ser global (módulo 10C).

import { Provider } from 'react-redux';
import store from '../../../shared/redux/store';
import Sidebar from '../sidebar/sidebar';
import { DealDrawerProvider } from '../../context/DealDrawerContext';
import DealDrawer from '../../components/wj/DealDrawer';

const Contentlayout = ({ children }) => {
    return (
        <Provider store={store}>
            <DealDrawerProvider>
                <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
                    <Sidebar />
                    <main style={{
                        marginLeft: 220,
                        padding: '34px 40px 80px',
                        maxWidth: 1560,
                        minWidth: 0,
                        width: '100%',
                    }}>
                        {children}
                    </main>
                </div>
                <DealDrawer />
            </DealDrawerProvider>
        </Provider>
    );
};

export default Contentlayout;
