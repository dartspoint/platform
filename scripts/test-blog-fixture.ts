import {createLocalBlogFixture,cleanupLocalBlogFixture,closeBlogFixtureConnections} from '../tests/helpers/blog-fixture';
try{if(process.argv.includes('--cleanup'))await cleanupLocalBlogFixture();else await createLocalBlogFixture();}finally{await closeBlogFixtureConnections();}
