import { Link } from 'react-router-dom';
import { PageTitle } from '../../components/ui';

export default function NotFound() {
  return (
    <div>
      <PageTitle>Page not found</PageTitle>
      <p>
        The page you're looking for doesn't exist. <Link to="/">Go to the home page</Link>.
      </p>
    </div>
  );
}
