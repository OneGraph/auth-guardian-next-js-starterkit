import Avatar from '../components/avatar'
import Date from '../components/date'
import CoverImage from '../components/cover-image'
import PostTitle from '../components/post-title'

export default function PostHeader({ title, coverImage, createdAt, author }) {
  return (
    <>
      <PostTitle>{title}</PostTitle>
      <div className="hidden md:block md:mb-12">
        <Avatar name={author.login} picture={author.avatarUrl} />
      </div>
      <div className="mb-8 md:mb-16 -mx-5 sm:mx-0">
        <CoverImage title={title} responsiveImage={coverImage} />
      </div>
      <div className="max-w-2xl mx-auto">
        <div className="block md:hidden mb-6">
          <Avatar name={author.login} picture={author.avatarUrl} />
        </div>
        <div className="mb-6 text-lg">
          <Date dateString={createdAt} />
        </div>
      </div>
    </>
  )
}
