import { getAllUsers } from '@/pages/api/server/db/user/getAllUsers';
import { nanoid } from 'nanoid';
import { getServerSession } from 'next-auth';
import { Fragment, useState } from 'react';
import {
    Button,
    Card,
    Col,
    Form,
    Modal,
    Pagination,
    Row,
    Spinner,
} from 'react-bootstrap';
import { toast } from 'react-toastify';
import { Savetable } from '../../../shared/data/tables/datatablesdata';
import Pageheader from '../../../shared/layout-components/pageheader/pageheader';
import Seo from '../../../shared/layout-components/seo/seo';
import styles from './styles.module.scss';

const UsersComponent = ({ users }) => {
    const [contacts, setContacts] = useState(
        users?.map((user) => ({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            createdAt: user.createdAt
                ? new Date(user.createdAt).toLocaleDateString()
                : 'N/A',
            imageUrl: user.imageUrl || '',
        }))
    );

    const [searchTerm, setSearchTerm] = useState(''); // Estado para o valor da barra de pesquisa
    const [modalShow, setModalShow] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    const [formData, setFormData] = useState({
        id: '',
        name: '',
        email: '',
        role: 'SUBSCRIBER',
        password: nanoid(12), // Gera uma senha aleatória padrão com 12 caracteres
        imageUrl: '',
    });

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;

    // Função para lidar com a mudança no campo de pesquisa
    const handleSearchChange = (event) => {
        setSearchTerm(event.target.value);
        setCurrentPage(1); // Reinicia para a primeira página ao fazer uma nova pesquisa
    };

    // Filtrar contatos com base no valor da barra de pesquisa
    const filteredContacts = contacts.filter((contact) =>
        contact.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Paginação
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentItems = filteredContacts.slice(
        indexOfFirstItem,
        indexOfLastItem
    );
    const totalPages = Math.ceil(filteredContacts.length / itemsPerPage);

    const handlePageChange = (page) => setCurrentPage(page);

    const validateFields = () => {
        const { name, email } = formData;
        if (!name) return 'Nome';
        if (!email) return 'Email';
        return null;
    };

    const handleFormChange = (event) => {
        const { name, value } = event.target;
        setFormData((prevData) => ({
            ...prevData,
            [name]: value,
        }));
    };

    const handleAdd = () => {
        setFormData({
            id: nanoid(),
            name: '',
            email: '',
            role: 'SUBSCRIBER',
            password: nanoid(12), // Gera uma nova senha aleatória ao abrir o modal
            imageUrl: '',
        });
        setEditMode(false);
        setModalShow(true);
    };

    const handleEdit = (contact) => {
        setFormData(contact);
        setEditMode(true);
        setModalShow(true);
    };

    const handleSaveChanges = async (event) => {
        event.preventDefault();

        const missingField = validateFields();
        if (missingField) {
            toast.error(`Campo obrigatório: ${missingField}`);
            return;
        }

        setIsLoading(true);

        try {
            const response = await fetch(
                editMode ? `/api/user/updateUser` : `/api/user/createUser`,
                {
                    method: editMode ? 'PUT' : 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(formData),
                }
            );

            if (response.ok) {
                const updatedUser = await response.json();

                if (editMode) {
                    setContacts((prevContacts) =>
                        prevContacts.map((contact) =>
                            contact.id === updatedUser.id
                                ? updatedUser
                                : contact
                        )
                    );
                    toast.success('Usuário atualizado com sucesso! 🚀');
                } else {
                    setContacts((prevContacts) => [
                        ...prevContacts,
                        updatedUser,
                    ]);
                    toast.success('Usuário criado com sucesso! 🚀');
                }

                setModalShow(false);
            } else {
                const errorData = await response.json();
                toast.error(
                    `Erro ao ${editMode ? 'atualizar' : 'criar'} usuário: ${
                        errorData.message
                    }`
                );
            }
        } catch (error) {
            console.error(
                `Erro ao ${editMode ? 'atualizar' : 'criar'} usuário:`,
                error
            );
            toast.error(
                `Erro ao ${
                    editMode ? 'atualizar' : 'criar'
                } usuário. Tente novamente!`
            );
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (id) => {
        setDeletingId(id);
        try {
            const response = await fetch(`/api/user/deleteUser?id=${id}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                toast.success('Usuário excluído com sucesso!🚀');
                setContacts((prevContacts) =>
                    prevContacts.filter((c) => c.id !== id)
                );
            } else {
                toast.error('Falha ao excluir o usuário. Tente novamente!');
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            toast.error('Erro ao excluir o usuário!');
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <Fragment>
            <Seo title={'Usuários'} />
            <Pageheader title="Usuários" heading="Usuários" active="Usuários" />

            <Row>
                <Col xl={12}>
                    <Card className="custom-card">
                        <Card.Header>
                            <div className="card-title">
                                USUÁRIOS CADASTRADOS
                            </div>
                            <div className={styles.blockWrap}>
                                <Form.Control
                                    type="text"
                                    placeholder="Pesquisar por e-mail"
                                    value={searchTerm}
                                    onChange={handleSearchChange}
                                    className="w-50"
                                />
                                <Button
                                    variant="primary"
                                    onClick={handleAdd}
                                    className={styles.blockButton}
                                >
                                    Adicionar novo usuário
                                </Button>
                            </div>
                        </Card.Header>
                        <Card.Body>
                            <Savetable
                                users={currentItems}
                                onEdit={handleEdit}
                                onDelete={handleDelete}
                                deletingId={deletingId}
                            />
                            <Pagination className="mt-4 justify-content-center">
                                <Pagination.First
                                    onClick={() => handlePageChange(1)}
                                    disabled={currentPage === 1}
                                />
                                <Pagination.Prev
                                    onClick={() =>
                                        handlePageChange(currentPage - 1)
                                    }
                                    disabled={currentPage === 1}
                                />
                                {Array.from(
                                    { length: totalPages },
                                    (_, i) => i + 1
                                ).map((page) => (
                                    <Pagination.Item
                                        key={page}
                                        active={page === currentPage}
                                        onClick={() => handlePageChange(page)}
                                    >
                                        {page}
                                    </Pagination.Item>
                                ))}
                                <Pagination.Next
                                    onClick={() =>
                                        handlePageChange(currentPage + 1)
                                    }
                                    disabled={currentPage === totalPages}
                                />
                                <Pagination.Last
                                    onClick={() => handlePageChange(totalPages)}
                                    disabled={currentPage === totalPages}
                                />
                            </Pagination>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            <Modal show={modalShow} onHide={() => setModalShow(false)} centered>
                <Modal.Header closeButton>
                    <Modal.Title>
                        {editMode ? 'Editar Usuário' : 'Adicionar Novo Usuário'}
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form onSubmit={handleSaveChanges}>
                        <Form.Group controlId="formName">
                            <Form.Label>Nome</Form.Label>
                            <Form.Control
                                type="text"
                                name="name"
                                placeholder="Nome"
                                onChange={handleFormChange}
                                value={formData.name}
                                className="mb-2"
                                required
                            />
                        </Form.Group>

                        <Form.Group controlId="formEmail">
                            <Form.Label>Email</Form.Label>
                            <Form.Control
                                type="email"
                                name="email"
                                placeholder="Email"
                                onChange={handleFormChange}
                                value={formData.email}
                                className="mb-2"
                                required
                            />
                        </Form.Group>

                        <Form.Group controlId="formRole">
                            <Form.Label>Nível de Acesso</Form.Label>
                            <Form.Select
                                name="role"
                                onChange={handleFormChange}
                                value={formData.role}
                                className="mb-2"
                                required
                            >
                                <option value="SUBSCRIBER">Assinante</option>
                                <option value="ADMIN">Administrador</option>
                            </Form.Select>
                        </Form.Group>

                        {!editMode && (
                            <Form.Group controlId="formPassword">
                                <Form.Label>
                                    Senha (Gerada Automaticamente)
                                </Form.Label>
                                <Form.Control
                                    type="text"
                                    name="password"
                                    placeholder="Senha"
                                    value={formData.password}
                                    readOnly
                                    className="mb-2"
                                />
                            </Form.Group>
                        )}

                        <Button
                            variant="primary"
                            type="submit"
                            className="mt-3"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <>
                                    <Spinner
                                        as="span"
                                        animation="border"
                                        size="sm"
                                        role="status"
                                        aria-hidden="true"
                                    />{' '}
                                    {editMode
                                        ? 'Salvando...'
                                        : 'Adicionando...'}
                                </>
                            ) : editMode ? (
                                'Salvar Alterações'
                            ) : (
                                'Adicionar'
                            )}
                        </Button>
                    </Form>
                </Modal.Body>
            </Modal>
        </Fragment>
    );
};

export const getServerSideProps = async (context) => {
    const session = await getServerSession(context.req, context.res);

    if (!session) {
        return {
            redirect: {
                destination: '/',
                permanent: false,
            },
        };
    }

    const users = await getAllUsers();

    return {
        props: {
            users,
        },
    };
};

UsersComponent.layout = 'Contentlayout';
export default UsersComponent;
